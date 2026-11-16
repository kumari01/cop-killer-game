class GameError extends Error {}
const cleanName = v => {
  if (typeof v !== 'string') throw new GameError('Enter a valid name.');
  const n = v.replace(/[\u0000-\u001f<>]/g, '').trim().replace(/\s+/g, ' ');
  if (n.length < 1 || n.length > 16) throw new GameError('Name must be 1-16 characters.');
  return n;
};
const cleanRoomId = v => {
  const r = typeof v === 'string' ? v.trim().toUpperCase() : '';
  if (!/^[A-Z0-9]{6}$/.test(r)) throw new GameError('Room ID must be 6 characters.');
  return r;
};
// Wrap a handler: only GameError messages reach the client.
const guard = (socket, fn) => async data => {
  try { await fn(data && typeof data === 'object' ? data : {}); }
  catch (e) { socket.emit('error-message', e instanceof GameError ? e.message : 'Something went wrong.'); if (!(e instanceof GameError)) console.error(e); }
};
module.exports = { GameError, cleanName, cleanRoomId, guard };
