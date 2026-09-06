import express from "express"
import dotenv from "dotenv"
import mongoose from "mongoose"
import cors from "cors"
dotenv.config()
const port = process.env.PORT || 5000
const mongodbUrl=process.env.MONGODB_URL
import http from "http"
import { Server } from "socket.io"
import User from "./models/user.model.js"
const connectDb=async () => {
    try {
        await mongoose.connect(mongodbUrl)
        console.log("DB connected")
    } catch (error) {
        console.log("DB error")
    }
}

const allowedOrigins = [
    process.env.NEXT_BASE_URL,
    "https://road-mate-microservice.vercel.app",
    "http://localhost:3000"
].filter(Boolean)

const app=express()
app.use(cors({ origin: allowedOrigins }))
app.use(express.json())
const server=http.createServer(app)

const io=new Server(server,{
    cors:{
        origin: allowedOrigins,
        methods: ["GET", "POST"]
    }
})

// Root & Health check endpoint
app.get("/", (req, res) => {
    res.send("Hello I am Roadmate SocketServer")
})

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        message: "Hello I am Roadmate SocketServer",
        timestamp: new Date().toISOString()
    })
})

// 10-minute keep-alive self-ping request
const KEEP_ALIVE_INTERVAL = 10 * 60 * 1000 // 10 minutes

setInterval(async () => {
    try {
        const targetUrl = process.env.RENDER_EXTERNAL_URL || process.env.SERVER_URL || `http://localhost:${port}`
        const res = await fetch(targetUrl)
        const text = await res.text()
        console.log(`[${new Date().toLocaleTimeString()}] Keep-alive ping to ${targetUrl} -> "${text.trim()}"`)

        // Also emit heartbeat to connected socket clients
        io.emit("heartbeat", {
            message: "Hello I am Roadmate SocketServer",
            timestamp: new Date().toISOString()
        })
    } catch (err) {
        console.log("[Keep-alive] Ping error:", err.message)
    }
}, KEEP_ALIVE_INTERVAL)


app.post("/emit",async (req,res)=>{
const {event,userId,data}=req.body
try {
    const user=await User.findById(userId)
    if(user.socketId){
io.to(user.socketId).emit(event,data)
    }
    
    return res.json({success:true})
} catch (error) {
    return res.json({success:false})
}
})

io.on("connection",(socket)=>{
  
   socket.on("identity",async (userId)=>{
      socket.userId=userId
      await User.findByIdAndUpdate(userId,{
        socketId:socket.id,
        isOnline:true
      })

   })


   socket.on("update-location",async ({userId,latitude,longitude})=>{
    await User.findByIdAndUpdate(userId,{
        location:{
            type:"Point",
            coordinates:[longitude,latitude]
        }
    })
   })

   socket.on("join-ride",(bookingId)=>{
    console.log("join ride",bookingId)
    socket.join(`ride-${bookingId}`)
   })

   socket.on("driver-location-update",({bookingId,latitude,longitude,status})=>{
    io.to(`ride-${bookingId}`).emit("driver-location",{
        latitude,
        longitude
    })
   })

   socket.on("chat-message",(data)=>{
    io.to(`ride-${data.bookingId}`).emit("chat-message",data)
   })


   socket.on("disconnect",async ()=>{
    if(!socket.userId)return;
await User.findByIdAndUpdate(socket.userId,{
        socketId:null,
        isOnline:false
      })
   })

})




server.listen(port,()=>{
    console.log("server started")
    connectDb()
})
