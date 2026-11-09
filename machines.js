// Every mode the extension can be in, written down as explicit state machines.
// Pure data + one tiny runner, no DOM or audio, so it loads in the page, the popup,
// the converter, the service worker and the tests alike. See AGENTS.md for the diagrams.
(function (root) {
  'use strict';

  /**
   * @typedef {{ initial: string, states: Object<string, { on?: Object<string, string> }> }} MachineDef
   * @typedef {{ readonly state: string, can(ev: string): boolean, send(ev: string): boolean,
   *             is(...states: string[]): boolean, onChange(fn: (to: string, from: string, ev: string) => void): void }} Machine
   */

  /**
   * Runs a machine definition. send() follows a transition only if the current state
   * allows that event; anything else is ignored and returns false, so impossible states
   * can't happen.
   * @param {MachineDef} def
   * @returns {Machine}
   */
  function createMachine(def) {
    let state = def.initial;
    const listeners = [];
    return {
      get state() { return state; },
      can(ev) { return !!((def.states[state].on || {})[ev]); },
      is(...states) { return states.includes(state); },
      send(ev) {
        const to = (def.states[state].on || {})[ev];
        if (!to) return false;
        const from = state;
        state = to;
        if (to !== from) listeners.forEach((fn) => fn(to, from, ev));
        return true;
      },
      onChange(fn) { listeners.push(fn); },
    };
  }

  const freeze = (def) => Object.freeze(def);

  // content.js: is 8D connected to the page, and is it on?
  // detached = no audio graph yet (page audio untouched), off = graph built but bypassed.
  const POWER = freeze({
    initial: 'detached',
    states: {
      detached: { on: { ATTACHED: 'off' } },
      off: { on: { ENABLE: 'on' } },
      on: { on: { DISABLE: 'off' } },
    },
  });

  // content.js: "Turn on automatically on this site". Fires at most once per page load.
  const AUTOSTART = freeze({
    initial: 'idle',
    states: {
      idle: { on: { ARM: 'armed' } },
      armed: { on: { DISARM: 'idle', FIRE: 'fired' } },
      fired: { on: {} },
    },
  });

  // content.js: where settings are saved. global = storage.sync, site = storage.local.
  const SCOPE = freeze({
    initial: 'global',
    states: {
      global: { on: { USE_SITE: 'site' } },
      site: { on: { USE_GLOBAL: 'global' } },
    },
  });

  // popup.js: what the popup is showing.
  const POPUP = freeze({
    initial: 'loading',
    states: {
      loading: { on: { UNSUPPORTED: 'unsupported', NEEDS_PERMISSION: 'needsPermission', READY_OFF: 'off', READY_ON: 'on', FAIL: 'failed' } },
      unsupported: { on: {} },
      needsPermission: { on: { REQUEST: 'requestingPermission' } },
      requestingPermission: { on: { GRANTED: 'loading', DENIED: 'needsPermission' } },
      off: { on: { TOGGLE: 'turningOn', LOST: 'failed' } },
      turningOn: { on: { TURNED_ON: 'on', REFUSED: 'off', LOST: 'failed' } },
      on: { on: { TOGGLE: 'turningOff', LOST: 'failed' } },
      turningOff: { on: { TURNED_OFF: 'off', LOST: 'failed' } },
      failed: { on: { RETRY: 'loading' } },
    },
  });

  // converter.js: one file in the list.
  const FILE = freeze({
    initial: 'queued',
    states: {
      queued: { on: { START: 'reading' } },
      reading: { on: { DECODED: 'rendering', FAIL: 'failed' } },
      rendering: { on: { FINISHED: 'done', FAIL: 'failed' } },
      done: { on: {} },
      failed: { on: {} },
    },
  });

  // converter.js: the Convert button / batch run.
  const BATCH = freeze({
    initial: 'idle',
    states: {
      idle: { on: { START: 'running' } },
      running: { on: { FINISHED: 'idle' } },
    },
  });

  const DEFS = Object.freeze({ POWER, AUTOSTART, SCOPE, POPUP, FILE, BATCH });
  const api = { createMachine, DEFS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EightDMachines = api;
})(typeof self !== 'undefined' ? self : this);
