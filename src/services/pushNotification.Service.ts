const { JWT } = require("google-auth-library");
const axios = require("axios");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ quiet: true })

const APP_ENV = process.env.APP_ENV || "star";

let FCM_ENDPOINT = "https://fcm.googleapis.com/v1/projects/cnibusiness-e24b5/messages:send";
let serviceAccount = path.join(
    __dirname,
    "../views",
    "cnibusiness-e24b5-8998a40714cd.json"
);

const client = new JWT({
    keyFile: serviceAccount,
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
});

export async function sendPushNotification(
    token: string,
    title: string,
    input: any
) {
    if (!token || typeof token !== "string") {
        console.error("Invalid or empty token.");
        return false;
    }

    try {
        const { token: accessToken } = await client.getAccessToken();

        if (!accessToken) {
            throw new Error("Failed to get access token");
        }

        const message = {
            message: {
                token,
                notification: {
                    title,
                    body: input.content ?? "",
                },
                data: {
                    moduleName: input.moduleName ?? "",
                    moduleId: input.moduleId ?? "",
                },
            },
        };

        const response = await axios.post(FCM_ENDPOINT, message, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
        });

        console.log("Notification sent successfully:", response.data);

        return response.data;
    } catch (error: any) {
        console.error(
            "Error sending notification:",
            error?.response?.data ?? error.message
        );
        return {
            success: false,
            statusCode: error?.response?.status || 500,
            error: error?.response?.data ?? error.message,
        };
    }
}
