const app = {
    midi: null,
    inputChannel: 'f',
    channels: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'],
    outputDevice: 'output-3',
    outputChannelsConf: ['5', '6', '7'], //midi channels 6,7,8,
    outputChannels: {},
    lastChannel: '',

    tools: {
        inputHighlight: function(message) {
            const elMsgId = document.querySelector(`#midiDevices .inputs .${message.target.id}`);
            if (message.data[0].toString(16)[0] === '9') {
                elMsgId.classList.add('table-info');
            }
            if (message.data[0].toString(16)[0] === '8') {
                elMsgId.classList.remove('table-info');
            }
        },
        testSynth: function(message) {
            const frequency = testSynth.midiNoteToFrequency(message.data[1]);
            if (message.data[0].toString(16)[0] === '9' && message.data[2] > 0) {
                testSynth.playNote(frequency);
            }
            if (message.data[0].toString(16)[0] === '8' || message.data[2] === 0) {
                testSynth.stopNote(frequency);
            }
        }
    }
};

function changeOutputDevice(id) {
    app.outputDevice = id;
    document.querySelectorAll(`table.outputs .cell-id`).forEach(td => td.classList.remove('table-success'));
    document.querySelector(`table.outputs .${id} .cell-id`).classList.add('table-success');
    localStorage.setItem('midi-out-device', id);
}
function listInputsAndOutputs(midiAccess) {
    const elInputs = document.querySelector('#midiDevices .inputs tbody');
    const elOutputs = document.querySelector('#midiDevices .outputs tbody');
    for (const entry of midiAccess.inputs) {
        const input = entry[1];
        elInputs.innerHTML +=
            `<tr class="${input.id}">
                <td>${input.id}</td>
                <td>${input.manufacturer}</td>
                <td>${input.name}</td>
            </tr>`;
    }

    for (const entry of midiAccess.outputs) {
        const output = entry[1];
        elOutputs.innerHTML +=
            `<tr class="${output.id}" onclick="changeOutputDevice('${output.id}')">
                <td class="cell-id table-secondary ${app.outputDevice === output.id ? 'table-success' : ''}">
                    <button class="btn btn-outline-secondary">${output.id}</button>
                </td>
                <td>${output.manufacturer}</td>
                <td>${output.name}</td>
            </tr>`;
    }
}

function cycleOutputs(data) {
    let returnData = [...data];
    let n = data[0].toString(16).split('');
    if (n[0] !== '8' && n[0] !== '9') { return ;}
    let channel = app.outputChannels[Object.keys(app.outputChannels).find(c => app.outputChannels[c].free || (!app.outputChannels[c].free) && app.outputChannels[c].key === data[1])];
    app.lastChannel = channel ? channel.channel : app.lastChannel;
    if (n[0] === '9' && channel) {
        channel = app.outputChannels[Object.keys(app.outputChannels).find(c => app.outputChannels[c].key === data[1]) || channel.channel];
        app.lastChannel = channel.channel;
        document.querySelector(`#outputChannels button[data-channel="${channel.channel}"]`).classList.add('active');
        channel.free = false;
        channel.key = data[1];
    } else if (n[0] === '8' && channel) {
        channel = app.outputChannels[Object.keys(app.outputChannels).find(c => app.outputChannels[c].key === data[1]) || channel.channel];
        document.querySelector(`#outputChannels button[data-channel="${channel.channel}"]`).classList.remove('active');
        channel.free = true;
        channel.key = '';
    } else {
        return false;
    }
    n[1] = channel ? channel.channel : app.lastChannel;
    returnData[0] = parseInt(n.join(''), 16);
    return returnData;
}

function onMIDIMessage (message) {
    if (message.data[0].toString(16)[1] !== app.inputChannel) { return ; } // only want messages on the chosen channel
    if (message.data[0].toString(16)[0] === 'f') { return ; } // only want to deal with musical commands
    app.tools.inputHighlight(message);
    //app.tools.testSynth(message);
    let noteData = cycleOutputs(message.data);
    if (noteData) { app.midi.outputs.get(app.outputDevice).send(noteData); }
}

const testSynth = {
    context: new AudioContext(),
    oscillators: {},

    midiNoteToFrequency: function (note) {
        return Math.pow(2, ((note - 69) / 12)) * 440;
    },
    playNote: function (frequency) {
        testSynth.oscillators[frequency] = testSynth.context.createOscillator();
        testSynth.oscillators[frequency].frequency.value = frequency;

        testSynth.oscillators[frequency].connect(testSynth.context.destination);
        testSynth.oscillators[frequency].start(testSynth.context.currentTime);
    },
    stopNote: function (frequency) {
        try {
            testSynth.oscillators[frequency].stop(testSynth.context.currentTime);
            testSynth.oscillators[frequency].disconnect();
        } catch (e) {
        }
    }

};


function startLoggingMIDIInput(midi, indexOfPort) {
    const inputs = midi.inputs.values()
    for (var input = inputs.next();
         input && !input.done;
         input = inputs.next()) {
         input.value.onmidimessage = onMIDIMessage;
    }
}

function setInputSelect() {
    const elSelect = document.querySelector('#inputChannel');
    if (elSelect.children.length !== app.channels.length) {
        elSelect.innerHTML = app.channels.map(
            c => `<option value="${c}"${c === app.inputChannel ? 'selected' : '' }>
                        ${parseInt(c, 16) + 1}
                  </option>`
        ).join('');
    }
    app.inputChannel = elSelect.value;
    localStorage.setItem('midi-in', app.inputChannel);
    setOutputSelects();
}

function createChannel(channel) {
    return {
        channel: channel,
        free: true,
        key: ''
    };
}

function toggleOutputChannel(channel) {
    if(app.outputChannels[channel]) {
        app.outputChannels[channel] = false;
    } else {
        app.outputChannels[channel] = createChannel(channel);
    }
    localStorage.setItem('midi-out-channels', JSON.stringify(Object.keys(app.outputChannels).filter(c => !!app.outputChannels[c])));
    setOutputSelects();
}

function setOutputSelects() {
    const elOuts = document.querySelector('#outputChannels');
    elOuts.innerHTML = app.channels.map(
        c => `<button type="button" onclick="toggleOutputChannel('${c}')" class="btn btn-outline-${app.outputChannels[c] ? 'primary' : 'secondary'}" data-channel="${c}" ${app.inputChannel === c ? 'disabled="disabled"' : ''}>
                    ${parseInt(c, 16) + 1}
              </button>`
    ).join('');
}
function onMIDISuccess(midiAccess) {
    app.midi = midiAccess; // store in the global (in real usage, would probably keep in an object instance)
    const midiIn = localStorage.getItem('midi-in');
    const midiOutDevice = localStorage.getItem('midi-out-device');
    const midiOutChannels = localStorage.getItem('midi-out-channels');
    if (midiIn) { app.inputChannel = midiIn; }
    if (midiOutDevice) { app.outputDevice = midiOutDevice; }
    if (midiOutChannels) { app.outputChannelsConf = JSON.parse(midiOutChannels); }


    setInputSelect();
    app.outputChannelsConf.map(c => app.outputChannels[c] = createChannel(c));
    setOutputSelects();
    listInputsAndOutputs(app.midi);
    startLoggingMIDIInput(app.midi);
}

function onMIDIFailure(msg) {
    console.error(`Failed to get MIDI access - ${msg}`);
}

navigator.requestMIDIAccess().then(onMIDISuccess, onMIDIFailure);
