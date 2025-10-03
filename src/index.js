// import mongoose from "mongoose"
// import { DB_NAME } from "./constants";
// import express from "express"
// const app = express()

import dotenv from "dotenv"
dotenv.config({
    path: "./.env"
})

import connectDB from "./db/index.js"


connectDB()
.then(() => {
    app.lesten(process.env.PORT, () =>{
        console.log(`Server is running on port ${process.env.PORT}`)    
    })
})
.catch((error) => {
    console.error("mongo DB connection error:", error)
    throw error
})










// ;(async () =>{
//     try {
//         await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`)
//         app.on("error", (error) =>{
//             console.error("ERROR: Unable to connect to database")
//             throw error
//         })
//         app.listen(process.env.PORT, () =>{
//             console.log(`Server is running on port ${process.env.PORT}`)
//         })
//     } catch (error) {
//         console.error("ERROR:", error)
//         throw error
//     }
// })
        