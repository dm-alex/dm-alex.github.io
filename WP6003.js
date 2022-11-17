var CO2_LIMIT = prompt('Set CO2 limit');

CO2_LIMIT = (CO2_LIMIT > 0) ? CO2_LIMIT : 800;

const SENSOR_SERVICE = '0000fff0-0000-1000-8000-00805f9b34fb';
const SENSOR_WRITE = '0000fff1-0000-1000-8000-00805f9b34fb';
const SENSOR_READ = '0000fff4-0000-1000-8000-00805f9b34fb';

var service;
var readChar;
var writeChar;
var autoRefreshInterval;
var old_co2 = 0;

function requestNotifications() {
    if(Notification.permission === 'granted'){
        console.log('Notification permission already granted');

        return true;
    }
    Notification.requestPermission().then((result) => {
        console.log('Notification permission result');
    });

    return Notification.permission === 'granted' ? true : false;
}

function pushNotification(text) {
    if (!requestNotifications()) {
        console.log('requestNotifications permission return false');
    }

    try {
        const notification = new Notification('CO2 limit exceeded ' + CO2_LIMIT, { body: 'Current CO2 = ' + text, dir: 'ltr' });

        notification.onerror = function(e) {
            alert('Notification error: ' + e.message)
        };
    } catch (e) {
        alert('Send notification error : ' + e.message);
    }


}


async function initConnection() {
    if (service != null)
        return;

    try {
        service = await getService(SENSOR_SERVICE);

        writeChar = await service.getCharacteristic(SENSOR_WRITE);
        readChar = await service.getCharacteristic(SENSOR_READ);
    } catch (error) {
        log('BT connection error. Please retry or refresh the browser.');
        alert(error.message);
    }
}

async function enableNotifications() {
    await initConnection();

    log('Enabaling notifications');
    await readChar.startNotifications();
    readChar.addEventListener('characteristicvaluechanged', handleNotifications);

    log('Waiting on data... may take some time on a first read');
}

async function readData() {
    await initConnection();

    await writeChar.writeValue(Uint8Array.of(0xAB));
}

async function sendCommand() {
    await initConnection();

    let command = prompt('Enter a command in HEX', 800);

    await writeChar.writeValue(fromHexString(command));
}

async function calibrate() {
    await initConnection();

    await writeChar.writeValue(Uint8Array.of(0xAD));
    log('Calabration started');
}

function autoRefresh() {
    if (autoRefreshInterval) {
        clearTimeout(autoRefreshInterval);
        log('Auto refresh disabled');
    } else {
        autoRefreshInterval = setInterval(() => readData(), 30000);
        log('Auto refresh enabled');
        readData();
    }
}


function handleNotifications(event) {
    let value = event.target.value;

    console.log(value);
    console.log(toHexString(value));

    let notificationType = value.getUint8(0);

    switch (notificationType) {
        case 0x0a:
        case 0x0b:
            logSensorData(value);
            break;
        default:
            // nothing to decode
    }
}

function logSensorData(value) {
    try {
        let time = new Date().toLocaleString();
        let temp = value.getInt16(6) / 10.0;
        let tvoc = value.getUint16(10) / 1000.0;
        let hcho = value.getUint16(12) / 1000.0;
        let co2 = value.getUint16(16);

        log(`Time: ${time} <br/>
         Temp: ${temp} <br/>
         TVOC: ${tvoc} <br/>
         HCHO: ${hcho} <br/>
         CO2 : ${co2} <br/>`);

        if (co2 >= CO2_LIMIT && old_co2 >= CO2_LIMIT) {
            pushNotification(co2);
        }

        old_co2 = co2;

    } catch (error) {
        log('Value parsing faild!');
        console.error(error);
    }
}

async function getService(service) {
    if (!('bluetooth' in navigator)) {
        throw 'Bluetooth API not supported.';
    }

    let options = {
        acceptAllDevices: true,
        optionalServices: [service]
    };

    return navigator.bluetooth.requestDevice(options)
        .then(function(device) {
            log('Connecting...')
            return device.gatt.connect();
        })
        .then(function(server) {
            log('Getting primary service...')
            return server.getPrimaryService(service);
        });
}

function log(message) {
    let element = document.getElementById('console');
    console.log(message);
    element.innerHTML = message;
}

//https://stackoverflow.com/questions/38987784/how-to-convert-a-hexadecimal-string-to-uint8array-and-back-in-javascript
function fromHexString(hexString) {
    if (hexString.length === 0 || hexString.length % 2 !== 0) {
        throw new Error(`The string "${hexString}" is not valid hex.`)
    }
    return new Uint8Array(hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
}

function toHexString(data) {
    let bytes = data;
    if (data instanceof DataView) {
        bytes = new Uint8Array(data.buffer);
    }
    return bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '');
}
