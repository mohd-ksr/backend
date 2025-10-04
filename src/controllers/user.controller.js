import {asyncHandler} from '../utils/asyncHandler.js';
import {ApiError} from '../utils/apiError.js';
import { User } from '../models/user.model.js';
import { uploadToCloudinary } from '../utils/cloudinary.js';
import { ApiResponse } from '../utils/ApiResponse.js';

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
    console.log("Email:", email);

    if([fullname, email, username, password].some((field) => field?.trim()==="")){
        throw new ApiError(400, "All fields are required");
    }
    const existedUser = User.findOne({
        $or: [{ email },{ username }]
    })
    if(existedUser){
        throw new ApiError(409, "User already exists with this email or username");
    }

    const avatarLocalPath = req.files?.avatar?.[0];
    const coverImageLocalPath = req.files?.coverImage?.[0];
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

export {registerUser};