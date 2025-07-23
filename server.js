const Fastify = require("fastify");
const cors = require("@fastify/cors");
const WebSocket = require("ws");

const TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhbW91bnQiOjE0MDAsInVzZXJuYW1lIjoiU0Nfbmd1eWVudmFudGluaG5lIn0.owsA4eD0qVYinV3CZcPIu5nLuUVm56ZZmoTRz9WVGW8";

const fastify = Fastify({ logger: false });
const PORT = process.env.PORT || 3001;

let rikResults = [];
let rikCurrentSession = null;
let rikWS = null;
let rikIntervalCmd = null;
const HISTORY_LIMIT = 100;

function decodeBinaryMessage(buffer) {
  try {
    const str = buffer.toString();
    if (str.startsWith("[")) {
      return JSON.parse(str);
    }
    
    let position = 0;
    const result = [];
    
    while (position < buffer.length) {
      const type = buffer.readUInt8(position++);
      
      if (type === 1) {
        const length = buffer.readUInt16BE(position);
        position += 2;
        const str = buffer.toString('utf8', position, position + length);
        position += length;
        result.push(str);
      } 
      else if (type === 2) {
        const num = buffer.readInt32BE(position);
        position += 4;
        result.push(num);
      }
      else if (type === 3) {
        const length = buffer.readUInt16BE(position);
        position += 2;
        const objStr = buffer.toString('utf8', position, position + length);
        position += length;
        result.push(JSON.parse(objStr));
      }
      else if (type === 4) {
        const length = buffer.readUInt16BE(position);
        position += 2;
        const arrStr = buffer.toString('utf8', position, position + length);
        position += length;
        result.push(JSON.parse(arrStr));
      }
      else {
        console.warn("Unknown binary type:", type);
        break;
      }
    }
    
    return result.length === 1 ? result[0] : result;
  } catch (e) {
    console.error("Binary decode error:", e);
    return null;
  }
}

function getTX(d1, d2, d3) {
  const sum = d1 + d2 + d3;
  return sum >= 11 ? "Tài" : "Xỉu";
}

function sendRikCmd1005() {
  if (rikWS && rikWS.readyState === WebSocket.OPEN) {
    const payload = [6, "MiniGame", "taixiuPlugin", { cmd: 1005 }];
    rikWS.send(JSON.stringify(payload));
  }
}

function connectRikWebSocket() {
  console.log("🔌 Connecting to SunWin WebSocket...");
  rikWS = new WebSocket(`wss://websocket.azhkthg1.net/websocket?token=${TOKEN}`);

  rikWS.on("open", () => {
    const authPayload = [
      1,
      "MiniGame",
      "SC_condimemaysunwin",
      "daucac123",
      {
        "info": "{\"ipAddress\":\"14.191.224.29\",\"wsToken\":\"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJnZW5kZXIiOjAsImNhblZpZXdTdGF0IjpmYWxzZSwiZGlzcGxheU5hbWUiOiJhbmhsYXRydW05OTEyIiwiYm90IjowLCJpc01lcmNoYW50IjpmYWxzZSwidmVyaWZpZWRCYW5rQWNjb3VudCI6ZmFsc2UsInBsYXlFdmVudExvYmJ5IjpmYWxzZSwiY3VzdG9tZXJJZCI6MjkzMDQ0MjIzLCJhZmZJZCI6IjZlYjdhYzA1LTQzMmYtNDBiOC04YTk2LWZhOWQ2YjA2NjFlOSIsImJhbm5lZCI6ZmFsc2UsImJyYW5kIjoic3VuLndpbiIsInRpbWVzdGFtcCI6MTc1MzI4NTk0OTY1OSwibG9ja0dhbWVzIjpbXSwiYW1vdW50IjowLCJsb2NrQ2hhdCI6ZmFsc2UsInBob25lVmVyaWZpZWQiOmZhbHNlLCJpcEFkZHJlc3MiOiIxNC4xOTEuMjI0LjI5IiwibXV0ZSI6ZmFsc2UsImF2YXRhciI6Imh0dHBzOi8vaW1hZ2VzLnN3aW5zaG9wLm5ldC9pbWFnZXMvYXZhdGFyL2F2YXRhcl8xNi5wbmciLCJwbGF0Zm9ybUlkIjo1LCJ1c2VySWQiOiI2ZWI3YWMwNS00MzJmLTQwYjgtOGE5Ni1mYTlkNmIwNjYxZTkiLCJyZWdUaW1lIjoxNzUzMjQ4OTU1MjE0LCJwaG9uZSI6IiIsImRlcG9zaXQiOmZhbHNlLCJ1c2VybmFtZSI6IlNDX2NvbmRpbWVtYXlzdW53aW4ifQ.csgYxMiu-Ds81_LEEdI8Rsv53shbIUR9KVfkjfxqm08\",\"userId\":\"6eb7ac05-432f-40b8-8a96-fa9d6b0661e9\",\"username\":\"SC_condimemaysunwin\",\"timestamp\":1753285949660}",
        "signature": "7E1676EAC657428BE77D61EB06CFBB16B49308116CAA51EA6555A5A01799D831E17EE27830A10792156E1864AC7E4BF0538BF619AEFE2530AB3B14868BCD3D73E5AC884ACDC895E15109475291C07A819080B4CBCEDF208A207FC6372A0BD314E7F59EC5D2952ABB9B9587355426245C677597EBF55A609CF4F59F27DA6A232A",
        "pid": 5,
        "subi": true
      }
    ];
    rikWS.send(JSON.stringify(authPayload));
    clearInterval(rikIntervalCmd);
    rikIntervalCmd = setInterval(sendRikCmd1005, 5000);
  });

  rikWS.on("message", (data) => {
    try {
      const json = typeof data === 'string' ? JSON.parse(data) : decodeBinaryMessage(data);

      if (!json) return;

      if (Array.isArray(json) && json[3]?.res?.d1 && json[3]?.res?.sid) {
        const result = json[3].res;
        
        if (!rikCurrentSession || result.sid > rikCurrentSession) {
          rikCurrentSession = result.sid;

          rikResults.unshift({
            sid: result.sid,
            d1: result.d1,
            d2: result.d2,
            d3: result.d3
          });

          if (rikResults.length > HISTORY_LIMIT) {
            rikResults.pop();
          }

          console.log(`📥 Phiên mới ${result.sid} → ${getTX(result.d1, result.d2, result.d3)}`);
          
          setTimeout(() => {
            if (rikWS) rikWS.close();
            connectRikWebSocket();
          }, 1000);
        }
      }
      else if (Array.isArray(json) && json[1]?.htr) {
        const history = json[1].htr
          .map((item) => ({
            sid: item.sid,
            d1: item.d1,
            d2: item.d2,
            d3: item.d3,
          }))
          .sort((a, b) => b.sid - a.sid);

        rikResults = history.slice(0, HISTORY_LIMIT);
        console.log(`📦 Đã tải lịch sử ${rikResults.length} phiên gần nhất.`);
      }

    } catch (e) {
      console.error("❌ Parse error:", e.message);
    }
  });

  rikWS.on("close", () => {
    console.log("🔌 WebSocket disconnected. Reconnecting...");
    setTimeout(connectRikWebSocket, 5000);
  });

  rikWS.on("error", (err) => {
    console.error("🔌 WebSocket error:", err.message);
    rikWS.close();
  });
}

connectRikWebSocket();

fastify.register(cors);

// API 1: Kết quả mới nhất
fastify.get("/api/taixiu/sunwin", async () => {
  const validResults = rikResults.filter(item => item.d1 && item.d2 && item.d3);

  if (validResults.length === 0) {
    return { message: "Không có dữ liệu." };
  }

  const current = validResults[0];
  const sum = current.d1 + current.d2 + current.d3;

  return {
    Phien: current.sid,
    Xuc_xac_1: current.d1,
    Xuc_xac_2: current.d2,
    Xuc_xac_3: current.d3,
    Tong: sum,
    Ket_qua: getTX(current.d1, current.d2, current.d3)
  };
});

// API 2: Lịch sử 100 phiên
fastify.get("/api/taixiu/history", async () => {
  const validResults = rikResults.filter(item => item.d1 && item.d2 && item.d3);

  if (validResults.length === 0) {
    return { message: "Không có dữ liệu." };
  }

  return validResults.map(item => {
    const sum = item.d1 + item.d2 + item.d3;
    return {
      Phien: item.sid,
      Xuc_xac_1: item.d1,
      Xuc_xac_2: item.d2,
      Xuc_xac_3: item.d3,
      Tong: sum,
      Ket_qua: getTX(item.d1, item.d2, item.d3)
    };
  });
});

const start = async () => {
  try {
    const address = await fastify.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`🚀 API chạy tại ${address}`);
    console.log("👉 GET /api/taixiu/sunwin - Kết quả mới nhất");
    console.log("👉 GET /api/taixiu/history - Lịch sử 100 phiên");
  } catch (err) {
    console.error("❌ Server error:", err);
    process.exit(1);
  }
};

start();
