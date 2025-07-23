const Fastify = require('fastify');
const cors = require('@fastify/cors');
const WebSocket = require('ws');
const fs = require('fs');
const msgpack = require('msgpack-lite');

// Cấu hình log
const logStream = fs.createWriteStream('websocket_full.log', { flags: 'a' });
function logPayload(direction, data) {
  const timestamp = new Date().toISOString();
  let logEntry = `[${timestamp}] ${direction}:\n`;
  
  if (Buffer.isBuffer(data)) {
    logEntry += `HEX: ${data.toString('hex')}\n`;
    try {
      const decoded = msgpack.decode(data);
      logEntry += `Decoded: ${JSON.stringify(decoded, null, 2)}\n`;
    } catch (e) {
      logEntry += `Text: ${data.toString()}\n`;
    }
  } else {
    logEntry += `${JSON.stringify(data, null, 2)}\n`;
  }
  
  logEntry += '----------------------------------------\n';
  logStream.write(logEntry);
  console.log(logEntry);
}

const TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhbW91bnQiOjE0MDAsInVzZXJuYW1lIjoiU0Nfbmd1eWVudmFudGluaG5lIn0.owsA4eD0qVYinV3CZcPIu5nLuUVm56ZZmoTRz9WVGW8";

const fastify = Fastify({ logger: false });
const PORT = process.env.PORT || 3001;

let rikResults = [];
let rikCurrentSession = null;
let rikWS = null;
let rikIntervalCmd = null;
const HISTORY_LIMIT = 100;

function decodeMessage(data) {
  try {
    // Nếu là string, parse JSON
    if (typeof data === 'string') {
      return JSON.parse(data);
    }
    
    // Thử decode MessagePack
    try {
      return msgpack.decode(data);
    } catch (e) {
      // Nếu không phải MessagePack, xử lý binary tùy chỉnh
      return decodeCustomBinary(data);
    }
  } catch (e) {
    console.error('Decode error:', e);
    return null;
  }
}

function decodeCustomBinary(buffer) {
  const result = [];
  let position = 0;
  
  while (position < buffer.length) {
    const type = buffer.readUInt8(position++);
    const length = buffer.readUInt16BE(position);
    position += 2;
    
    let value;
    try {
      switch (type) {
        case 1: // String
          value = buffer.toString('utf8', position, position + length);
          break;
        case 2: // Number
          value = buffer.readInt32BE(position);
          break;
        case 3: // Object
          value = JSON.parse(buffer.toString('utf8', position, position + length));
          break;
        case 4: // Array
          value = JSON.parse(buffer.toString('utf8', position, position + length));
          break;
        default:
          value = buffer.slice(position, position + length);
      }
    } catch (e) {
      console.error(`Error decoding type ${type}:`, e);
      value = null;
    }
    
    position += length;
    result.push({ type, value });
  }
  
  return result;
}

function connectRikWebSocket() {
  console.log('🔌 Connecting to SunWin WebSocket...');
  rikWS = new WebSocket(`wss://websocket.azhkthg1.net/websocket?token=${TOKEN}`);

  rikWS.on('open', () => {
    console.log('✅ WebSocket connected');
    logPayload('OUTGOING', 'WebSocket connected');
    
    // Gửi payload đăng nhập
    const authPayload = [
      1,
      "MiniGame",
      "SC_condimemaysunwin",
      "daucac123",
      {
        "info": JSON.stringify({
          ipAddress: "14.191.224.29",
          wsToken: "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJnZW5kZXIiOjAsImNhblZpZXdTdGF0IjpmYWxzZSwiZGlzcGxheU5hbWUiOiJhbmhsYXRydW05OTEyIiwiYm90IjowLCJpc01lcmNoYW50IjpmYWxzZSwidmVyaWZpZWRCYW5rQWNjb3VudCI6ZmFsc2UsInBsYXlFdmVudExvYmJ5IjpmYWxzZSwiY3VzdG9tZXJJZCI6MjkzMDQ0MjIzLCJhZmZJZCI6IjZlYjdhYzA1LTQzMmYtNDBiOC04YTk2LWZhOWQ2YjA2NjFlOSIsImJhbm5lZCI6ZmFsc2UsImJyYW5kIjoic3VuLndpbiIsInRpbWVzdGFtcCI6MTc1MzI4NTk0OTY1OSwibG9ja0dhbWVzIjpbXSwiYW1vdW50IjowLCJsb2NrQ2hhdCI6ZmFsc2UsInBob25lVmVyaWZpZWQiOmZhbHNlLCJpcEFkZHJlc3MiOiIxNC4xOTEuMjI0LjI5IiwibXV0ZSI6ZmFsc2UsImF2YXRhciI6Imh0dHBzOi8vaW1hZ2VzLnN3aW5zaG9wLm5ldC9pbWFnZXMvYXZhdGFyL2F2YXRhcl8xNi5wbmciLCJwbGF0Zm9ybUlkIjo1LCJ1c2VySWQiOiI2ZWI3YWMwNS00MzJmLTQwYjgtOGE5Ni1mYTlkNmIwNjYxZTkiLCJyZWdUaW1lIjoxNzUzMjQ4OTU1MjE0LCJwaG9uZSI6IiIsImRlcG9zaXQiOmZhbHNlLCJ1c2VybmFtZSI6IlNDX2NvbmRpbWVtYXlzdW53aW4ifQ.csgYxMiu-Ds81_LEEdI8Rsv53shbIUR9KVfkjfxqm08",
          userId: "6eb7ac05-432f-40b8-8a96-fa9d6b0661e9",
          username: "SC_condimemaysunwin",
          timestamp: 1753285949660
        }),
        "signature": "7E1676EAC657428BE77D61EB06CFBB16B49308116CAA51EA6555A5A01799D831E17EE27830A10792156E1864AC7E4BF0538BF619AEFE2530AB3B14868BCD3D73E5AC884ACDC895E15109475291C07A819080B4CBCEDF208A207FC6372A0BD314E7F59EC5D2952ABB9B9587355426245C677597EBF55A609CF4F59F27DA6A232A",
        "pid": 5,
        "subi": true
      }
    ];
    
    rikWS.send(JSON.stringify(authPayload));
    logPayload('OUTGOING', authPayload);
    
    // Gửi lệnh yêu cầu lịch sử
    const historyRequest = [6, "MiniGame", "taixiuPlugin", { cmd: 1005 }];
    setTimeout(() => {
      rikWS.send(JSON.stringify(historyRequest));
      logPayload('OUTGOING', historyRequest);
    }, 2000);
    
    // Thiết lập interval gửi lệnh
    clearInterval(rikIntervalCmd);
    rikIntervalCmd = setInterval(() => {
      rikWS.send(JSON.stringify(historyRequest));
      logPayload('OUTGOING', 'Periodic history request');
    }, 10000);
  });

  rikWS.on('message', (data) => {
    try {
      logPayload('INCOMING', data);
      
      const decoded = decodeMessage(data);
      if (!decoded) return;
      
      // Xử lý lịch sử (htr)
      if (decoded.htr || (Array.isArray(decoded) && decoded[1]?.htr)) {
        const historyData = decoded.htr || decoded[1].htr;
        
        if (Array.isArray(historyData)) {
          rikResults = historyData
            .map(item => ({
              sid: item.sid,
              d1: item.d1,
              d2: item.d2,
              d3: item.d3,
              timestamp: item.timestamp || Date.now()
            }))
            .sort((a, b) => b.sid - a.sid)
            .slice(0, HISTORY_LIMIT);
          
          console.log(`🔄 Đã cập nhật ${rikResults.length} phiên lịch sử`);
        }
      }
      
      // Xử lý kết quả mới
      if (Array.isArray(decoded) && decoded[3]?.res) {
        const result = decoded[3].res;
        
        if (result.d1 && result.d2 && result.d3 && result.sid) {
          if (!rikCurrentSession || result.sid > rikCurrentSession) {
            rikCurrentSession = result.sid;
            
            rikResults.unshift({
              sid: result.sid,
              d1: result.d1,
              d2: result.d2,
              d3: result.d3,
              timestamp: Date.now()
            });
            
            if (rikResults.length > HISTORY_LIMIT) {
              rikResults.pop();
            }
            
            console.log(`🎲 Phiên mới ${result.sid}: ${result.d1}-${result.d2}-${result.d3}`);
          }
        }
      }
    } catch (e) {
      console.error('❌ Lỗi xử lý message:', e);
    }
  });

  rikWS.on('close', () => {
    console.log('🔌 WebSocket disconnected');
    setTimeout(connectRikWebSocket, 5000);
  });

  rikWS.on('error', (err) => {
    console.error('🔥 WebSocket error:', err);
  });
}

// Khởi động WebSocket
connectRikWebSocket();

// API
fastify.register(cors);

fastify.get('/api/taixiu/sunwin', async () => {
  if (rikResults.length === 0) {
    return { error: 'Chưa có dữ liệu', lastUpdate: new Date().toISOString() };
  }
  
  const latest = rikResults[0];
  const sum = latest.d1 + latest.d2 + latest.d3;
  
  return {
    phien: latest.sid,
    xuc_xac: [latest.d1, latest.d2, latest.d3],
    tong: sum,
    ket_qua: sum >= 11 ? 'Tài' : 'Xỉu',
    thoi_gian: new Date(latest.timestamp).toISOString(),
    history_count: rikResults.length
  };
});

fastify.get('/api/taixiu/history', async () => {
  return {
    count: rikResults.length,
    history: rikResults.map(item => {
      const sum = item.d1 + item.d2 + item.d3;
      return {
        phien: item.sid,
        xuc_xac: [item.d1, item.d2, item.d3],
        tong: sum,
        ket_qua: sum >= 11 ? 'Tài' : 'Xỉu',
        thoi_gian: new Date(item.timestamp).toISOString()
      };
    })
  };
});

fastify.get('/api/taixiu/debug', async () => {
  return {
    wsState: rikWS?.readyState,
    lastSession: rikCurrentSession,
    resultsCount: rikResults.length,
    sampleData: rikResults.slice(0, 3)
  };
});

fastify.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) {
    console.error('❌ Lỗi khởi động server:', err);
    process.exit(1);
  }
  console.log(`🚀 Server chạy tại http://localhost:${PORT}`);
});
