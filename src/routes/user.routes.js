import {Router} from "express";
import {registerUser, loginUser, logoutUser, refreshAccessToken} from '../controllers/user.controller.js';
import { upload } from "../middlewares/multer.middleware.js";
import { varifyJWT } from "../middlewares/auth.middileware.js";
const router = Router();


router.route("/register").post(
    upload.fields([
        {
            name: "avatar", maxCount: 1
        },
        {
            name: "coverImage", maxCount: 1
        }
    ]),
    registerUser
)
router.route("/login").post(loginUser);

// Secured route
router.route("/logout").post(varifyJWT ,logoutUser);
router.route("/refresh-access-token").post(refreshAccessToken);


export default router;