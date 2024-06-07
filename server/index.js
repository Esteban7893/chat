import express from 'express';
import logger from 'morgan';
import { Server } from 'socket.io';
import { createServer } from 'node:http';
import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

dotenv.config();

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

await turso.execute('CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, message TEXT NOT NULL)');

const port = process.env.PORT || 3000;
const app = express();
const server = createServer(app);
const io = new Server(server);

io.on('connection', async (socket) => {
  console.log('a user connected');

  socket.on('chat message', async (msg) => {
    let result;
    try {
      result = await turso.execute({
        sql: 'INSERT INTO messages (message) VALUES (:msg)',
        args: { msg }
      });
    } catch (error) {
      console.error(error);
    }
    io.emit('chat message', msg, result.lastInsertRowid.toString());
  });

  socket.on('disconnect', () => {
    console.log('user disconnected');
  });

  if (!socket.recovered) { // si el socket no ha sido recuperado de una desconexión
    try {
      const result = await turso.execute({
        sql: 'SELECT id, message FROM messages where id > ?',
        args: [socket.handshake.auth.serverOffset ?? 0]
      });
      result.rows.forEach(row => {
        socket.emit('chat message', row.message, row.id.toString());
      });
    } catch (error) {
      console.error(error);
    }
  }
});

app.use(logger('dev'));

app.get('/', (req, res) => {
  res.sendFile(process.cwd() + '/client/index.html');
});

server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
