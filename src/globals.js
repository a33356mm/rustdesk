import Connection from "./connection";
import _sodium from "libsodium-wrappers";
import { CursorData } from "./message";
import { loadOpus, loadVp9 } from "./codec";
import { checkIfRetry, version } from "./gen_js_from_hbb";
import { initZstd, translate } from "./common";

var currentFrame = undefined;
var events = [];

window.curConn = undefined;
window.getRgba = () => {
  const tmp = currentFrame;
  currentFrame = undefined;
  return tmp || null;
}
window.isMobile = () => {
  return /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|ipad|iris|kindle|Android|Silk|lge |maemo|midp|mmp|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows (ce|phone)|xda|xiino/i.test(navigator.userAgent)
    || /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(navigator.userAgent.substr(0, 4));
}

export function isDesktop() {
  return !isMobile;
}

export function msgbox(type, title, text) {
  if (!events) return;
  if (!type || (type == 'error' && !text)) return;
  const text2 = text.toLowerCase();
  var hasRetry = checkIfRetry(type, title, text);
  events.push({ name: 'msgbox', type, title, text, hasRetry });
}

function jsonfyForDart(payload) {
  var tmp = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!key) continue;
    tmp[key] = value instanceof Uint8Array ? '[' + value.toString() + ']' : JSON.stringify(value);
  }
  return tmp;
}

export function pushEvent(name, payload) {
  if (!events) return;
  payload = jsonfyForDart(payload);
  payload.name = name;
  events.push(payload);
}

let yuvWorker;

export function draw(frame) {
  if (yuvWorker) yuvWorker.postMessage(frame);
}

export function setConn(conn) {
  window.curConn = conn;
}

export function getConn() {
  return window.curConn;
}

export async function startConn(id) {
  try {
    currentFrame = undefined;
    events = [];
    setByName('remote_id', id);
    await curConn.start(id);
  } catch (e) {
    console.log(e);
    msgbox('error', 'Error', String(e));
  }
}

export function close() {
  getConn()?.close();
  setConn(undefined);
  currentFrame = undefined;
  events = undefined;
}

export function newConn() {
  window.curConn?.close();
  const conn = new Connection();
  setConn(conn);
  return conn;
}

let sodium;
export async function verify(signed, pk) {
  if (!sodium) {
    await _sodium.ready;
    sodium = _sodium;
  }
  if (typeof pk == 'string') {
    pk = decodeBase64(pk);
  }
  return sodium.crypto_sign_open(signed, pk);
}

export function decodeBase64(pk) {
  return sodium.from_base64(pk, sodium.base64_variants.ORIGINAL);
}

export function genBoxKeyPair() {
  const pair = sodium.crypto_box_keypair();
  const sk = pair.privateKey;
  const pk = pair.publicKey;
  return [sk, pk];
}

export function genSecretKey() {
  return sodium.crypto_secretbox_keygen();
}

export function seal(unsigned, theirPk, ourSk) {
  const nonce = Uint8Array.from(Array(24).fill(0));
  return sodium.crypto_box_easy(unsigned, nonce, theirPk, ourSk);
}

function makeOnce(value) {
  var byteArray = Array(24).fill(0);

  for (var index = 0; index < byteArray.length && value > 0; index++) {
    var byte = value & 0xff;
    byteArray[index] = byte;
    value = (value - byte) / 256;
  }

  return Uint8Array.from(byteArray);
};

export function encrypt(unsigned, nonce, key) {
  return sodium.crypto_secretbox_easy(unsigned, makeOnce(nonce), key);
}

export function decrypt(signed, nonce, key) {
  return sodium.crypto_secretbox_open_easy(signed, makeOnce(nonce), key);
}

window.setByName = (name, value) => {
  switch (name) {
    case 'remote_id':
      localStorage.setItem('remote-id', value);
      break;
    case 'connect':
      newConn();
      startConn(value);
      break;
    case 'login':
      value = JSON.parse(value);
      curConn.setRemember(value.remember == 'true');
      curConn.login(value.password);
      break;
    case 'close':
      close();
      break;
    case 'refresh':
      curConn.refresh();
      break;
    case 'reconnect':
      curConn.reconnect();
      break;
    case 'toggle_option':
      curConn.toggleOption(value);
      break;
    case 'image_quality':
      curConn.setImageQuality(value);
      break;
    case 'lock_screen':
      curConn.lockScreen();
      break;
    case 'ctrl_alt_del':
      curConn.ctrlAltDel();
      break;
    case 'switch_display':
      curConn.switchDisplay(value);
      break;
    case 'remove':
      const peers = getPeers();
      delete peers[value];
      localStorage.setItem('peers', JSON.stringify(peers));
      break;
    case 'input_key':
      value = JSON.parse(value);
      curConn.inputKey(value.name, value.down || false, value.press || false, value.alt || false, value.ctrl || false, value.shift || false, value.command || false);
      break;
    case 'input_string':
      curConn.inputString(value);
      break;
    case 'send_mouse':
      let mask = 0;
      value = JSON.parse(value);
      switch (value.type) {
        case 'down':
          mask = 1;
          break;
        case 'up':
          mask = 2;
          break;
        case 'wheel':
          mask = 3;
          break;
      }
      switch (value.buttons) {
        case 'left':
          mask |= 1 << 3;
          break;
        case 'right':
          mask |= 2 << 3;
          break;
        case 'wheel':
          mask |= 4 << 3;
      }
      curConn.inputMouse(mask, parseInt(value.x || '0'), parseInt(value.y || '0'), value.alt || false, value.ctrl || false, value.shift || false, value.command || false);
      break;
    case 'option':
      value = JSON.parse(value);
      localStorage.setItem(value.name, value.value);
      break;
    case 'peer_option':
      value = JSON.parse(value);
      curConn.setOption(value.name, value.value);
      break;
    case 'input_os_password':
      curConn.inputOsPassword(value);
      break;
    default:
      break;
  }
}

window.getByName = (name, arg) => {
  let v = _getByName(name, arg);
  if (typeof v == 'string' || v instanceof String) return v;
  if (v == undefined || v == null) return '';
  return JSON.stringify(v);
}

function getPeersForDart() {
  const peers = [];
  for (const [id, value] of Object.entries(getPeers())) {
    if (!id) continue;
    const tm = value['tm'];
    const info = value['info'];
    if (!tm || !info) continue;
    peers.push([tm, id, info]);
  }
  return peers.sort().reverse().map(x => x.slice(1));
}

function _getByName(name, arg) {
  switch (name) {
    case 'peers':
      return getPeersForDart();
    case 'remote_id':
      return localStorage.getItem('remote-id');
    case 'remember':
      return curConn.getRemember();
    case 'event':
      if (events && events.length) {
        const e = events[0];
        events.splice(0, 1);
        return JSON.stringify(e);
      }
      break;
    case 'toggle_option':
      return curConn.getOption(arg) || false;
    case 'option':
      return localStorage.getItem(arg);
    case 'image_quality':
      return curConn.getImageQuality();
    case 'translate':
      arg = JSON.parse(arg);
      return translate(arg.locale, arg.text);
    case 'peer_option':
      return curConn.getOption(arg);
    case 'test_if_valid_server':
      break;
    case 'version':
      return version;
  }
  return '';
}

window.init = async () => {
  yuvWorker = new Worker("./yuv.js");
  yuvWorker.onmessage = (e) => {
    currentFrame = e.data;
  }
  loadOpus(() => { });
  loadVp9(() => { });
  await initZstd();
}

export function getPeers() {
  try {
    return JSON.parse(localStorage.getItem('peers')) || {};
  } catch (e) {
    return {};
  }
}
