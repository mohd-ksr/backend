import {asyncHandler} from '../utils/asyncHandler.js';
import {ApiError} from '../utils/apiError.js';
import { User } from '../models/user.model.js';
import { uploadToCloudinary } from '../utils/cloudinary.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import fs from "fs"
import jwt from 'jsonwebtoken';

const generateAccessAndRefreshToken = async (userId) => {
   try {
        const user = await User.findById(userId);
        if (!user) {
            throw new ApiError(404, "User not found");
        }
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();
        
        user.refershToken = refreshToken;
        await user.save({ validateBeforeSave: false });
        
        return { accessToken, refreshToken };
   } catch (error) {
    throw new ApiError(500, "Something went wrong while generating tokens");
   }
}

const registerUser = asyncHandler(async (req, res) => {
    // get user data from frontend
    // validation - not empty
    // check if user already exists: email or username
    // check for image, check avatar
    // upload image to cloudinary, avatar
    // create user object - create entry in db
    // remove password and refresh token from response
    // check for user creation
    // return response
    const {fullname, email, username, password} = req.body;
    // console.log("Email:", email);

    if([fullname, email, username, password].some((field) => field?.trim()==="")){
        throw new ApiError(400, "All fields are required");
    }

    const existedUser = await User.findOne({
        $or: [{ email },{ username }]
    })

    if(existedUser){
        // cleanup uploaded files
        if (req.files?.avatar?.[0]?.path) {
            fs.unlinkSync(req.files.avatar[0].path);
        }
        if (req.files?.coverImage?.[0]?.path) {
            fs.unlinkSync(req.files.coverImage[0].path);
        }
        throw new ApiError(409, "User already exists with this email or username");
    }
    
    // console.log("Files:", req.files);

    const avatarLocalPath = req.files?.avatar[0]?.path;
    //const coverImageLocalPath = req.files?.coverImage[0]?.path;
    let coverImageLocalPath;
    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0].path
    }

    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar is required");
    }

    const avatar = await uploadToCloudinary(avatarLocalPath);
    const coverImage = await uploadToCloudinary(coverImageLocalPath);

    if(!avatar){
        throw new ApiError(500, "Unable to upload avatar");
    }
    const user = await User.create({
        fullname,
        avatar:avatar.url,
        coverImage: coverImage?.url,
        email,
        password,
        username: username.toLowerCase(),
    })

    const createdUser = await User.findById(user._id).select("-password -refershToken");
    if(!createdUser){
        throw new ApiError(500, "Something went wrong while registering user");
    }

    res.status(201).json(new ApiResponse(200, createdUser, "User registered successfully"));
})

const loginUser = asyncHandler(async (req, res) => {
    // req bode data
    // username or email and password
    // find the user
    // password check
    // access and refresh token
    // send cookies

    const {username, email, password} = req.body;
    if(!username && !email){
        throw new ApiError(400, "Username or email is required");
    }
    if(!password?.trim()){
        throw new ApiError(400, "Password is required");
    }
    
    const user = await User.findOne({
        $or: [{username}, {email}]
    })
    if(!user){
        throw new ApiError(404, "User not found");
    }
    const isPassworValid = await user.isPasswordCorrect(password);
    if(!isPassworValid){
        throw new ApiError(401, "Invalid user credintial");
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(user._id)

    const logedInUser = await User.findById(user._id).select("-password -refershToken");
    if(!logedInUser){
        throw new ApiError(500, "Something went wrong while login user");
    }

    const options = {
        httpOnly: true,
        secure: true
    }
    return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(new ApiResponse(200, {user: logedInUser, accessToken, refreshToken}, "User logged in successfully"));

})

const logoutUser = asyncHandler(async (req, res) => {
    // get user id from req.user
    // find the user from db
    // remove refresh token from db
    // clear cookies
    // send response
    
    await User.findByIdAndUpdate(
        req.user._id, 
        {
            $set: { refershToken: undefined }
        }, 
        {new: true}
    );
    const options = {
        httpOnly: true,
        secure: true
    }
    return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out successfully"));
})

const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refershToken || req.body.refershToken
    if(!incomingRefreshToken){
        throw new ApiError(400, "Refresh token is required");
    }

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken, 
            process.env.REFRESH_TOKEN_SECRET
        )
        const user = await User.findById(decodedToken?._id);
        if(!user){
            throw new ApiError(400, "Invalid refresh token - user not found");
        }
        if(user.refershToken !== incomingRefreshToken){
            throw new ApiError(400, "Refresh token expired or mismatched");
        }
    
        const { accessToken, newrefreshToken } = await generateAccessAndRefreshToken(user._id)
        
        const options = {
            httpOnly: true,
            secure: true
        }
        return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", newrefreshToken, options)
        .json(new ApiResponse(200, { accessToken, refreshToken:newrefreshToken }, "Access token refreshed successfully"));
    } catch (error) {
        throw new ApiError(400, "Invalid refresh token");
    }
})

export {registerUser, loginUser, logoutUser, refreshAccessToken};