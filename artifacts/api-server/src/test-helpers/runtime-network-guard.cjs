/**
 * Opt-in preload for a managed-runtime route smoke check, NOT for normal use:
 * NODE_OPTIONS="--require <absolute path to this file>".
 * Refuse every outgoing connection (including gRPC) before starting any worker.
 * Incoming HTTP requests still reach the real, freshly built application.
 */
const net = require('node:net');
const dgram = require('node:dgram');
const { syncBuiltinESMExports } = require('node:module');
const message = 'Provider unavailable in isolated runtime check: outbound network disabled';
net.Socket.prototype.connect = function () {
  process.nextTick(() => this.destroy(new Error(message)));
  return this;
};
dgram.Socket.prototype.send = function () { throw new Error(message); };
globalThis.fetch = async () => { throw new Error(message); };
syncBuiltinESMExports();
