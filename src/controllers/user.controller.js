import {asyncHandler} from '../utils/asyncHandler.js';
import {ApiError} from '../utils/apiError.js';
import { User } from '../models/user.model.js';
import { uploadToCloudinary } from '../utils/cloudinary.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import fs from "fs"
import jwt from 'jsonwebtoken';
import { use } from 'react';

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
        throw new ApiError(400, "Refresh token is required!");
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

const changeCurrentPassword = asyncHandler(async (req, res) => {
    // get user id from req.user
    // get old password and new password from req.body
    // validate
    // find user from db
    // check old password
    // update with new password
    // save
    // response

   const { oldPassword, newPassword } = req.body;
   const user = await User.findById(req.user?._id)
   const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)
    if(!isPasswordCorrect){
        throw new ApiError(400, "Old password is incorrect");
    }
    user.password = newPassword;
    await user.save({ validateBeforeSave: true });
    return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"));
})

const getCurrentUser = asyncHandler(async (req, res) => {
    // get user id from req.user
    // find user from db
    // response
    return res
    .status(200)
    .json(new ApiResponse(200, req.user, "Current user fetched successfully"));
})

const updateAccountDetails = asyncHandler(async (req, res) => {
    // get user id from req.user
    // get user data from req.body
    // validate
    // find user from db
    // check for email or username change
    // update user object
    // save
    // response
    const {fullname, email} = req.body;
    if(!fullname?.trim() || !email?.trim()){
        throw new ApiError(400, "Fullname and email are required");
    }
    
    const user = await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                fullname:fullname,
                email:email
            }
        },
        {new: true}
    ).select("-password -refershToken");
    
    if(!user){
        throw new ApiError(500, "Something went wrong while updating user");
    }
    return res
    .status(200)
    .json(new ApiResponse(200, user, "User updated successfully"));
    
})

const updateUserAvatar = asyncHandler(async (req, res) => {
    // get user id from req.user
    // get image from req.file
    // validate
    // find user from db
    // upload image to cloudinary
    // update user object
    // save
    // response
    const avatarLocalPath = req.file?.path;
    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar is required");
    }
    const avatar = await uploadToCloudinary(avatarLocalPath);
    if(!avatar){
        throw new ApiError(500, "Unable to upload avatar");
    }
    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                avatar:avatar.url
            }
        },
        {new: true}
    ).select("-password -refershToken");
    
    if(!user){
        throw new ApiError(500, "Something went wrong while updating user avatar");
    }
    return res
    .status(200)
    .json(new ApiResponse(200, user, "User avatar updated successfully"));
})

const updateUserCoverImage = asyncHandler(async (req, res) => {
    // get user id from req.user
    // get image from req.file
    // validate
    // find user from db
    // upload image to cloudinary
    // update user object
    // save
    // response
    const coverImageLocalPath = req.file?.path;
    if(!coverImageLocalPath){
        throw new ApiError(400, "Cover image is required");
    }
    const coverImage = await uploadToCloudinary(coverImageLocalPath);
    if(!coverImage){
        throw new ApiError(500, "Unable to upload cover image");
    }
    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                coverImage:coverImage.url
            }
        },
        {new: true}
    ).select("-password -refershToken");
    
    if(!user){
        throw new ApiError(500, "Something went wrong while updating user cover image");
    }
    return res
    .status(200)
    .json(new ApiResponse(200, user, "User cover image updated successfully"));
})

const getUserChannelsDetails = asyncHandler(async (req, res) => {
    const {username} = req.params;
    if(!username?.trim()){
        throw new ApiError(400, "Username is missing");
    } 
    const channel = await User.aggregate([
        {
            $match: { username: username.toLowerCase() }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo"
            }
        },
        {
            $addFields: {
                subscribersCount: { $size: "$subscribers" },
                channleSubscribedToCount: { $size: "$subscribedTo" },
                isSubscribed: {
                    $cond: {
                        if: {
                            $in: [req.user?._id, "$subscribers.subscriber"]
                        },
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project: {
                fullname: 1,
                username: 1,
                email: 1,
                avatar: 1,
                coverImage: 1,
                subscribersCount: 1,
                channleSubscribedToCount: 1,
                isSubscribed: 1
            }
        }
    ])
    if(!channel || channel.length===0){
        throw new ApiError(404, "Channel not found");
    }
    return res
    .status(200)
    .json(new ApiResponse(200, channel[0], "Channel details fetched successfully"));

})

const getWatchHistory = asyncHandler(async (req, res) => {
    const user = await User.aggregate([
        {
            $match: { _id: new mongoose.Types.ObjectId(req.user?._id) }
        },
        {
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project: {
                                        fullname: 1,
                                        username: 1,
                                        avatar: 1,
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields: {
                            owner: { $arrayElemAt: ["$owner", 0] }
                        }
                    }
                ]
            }
        }
    ])
    return res
    .status(200)
    .json(new ApiResponse(200, user?.[0]?.watchHistory || [], "Watch history fetched successfully"));
})

export {
    registerUser, 
    loginUser, 
    logoutUser, 
    refreshAccessToken, 
    changeCurrentPassword, 
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelsDetails,
    getWatchHistory
};