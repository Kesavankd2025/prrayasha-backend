import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.TEXTSPEED_API_KEY;
const SENDER = process.env.TEXTSPEED_SENDER_ID;
const BASE_URL = process.env.TEXTSPEED_API_URL;
const TEMPLATE_ID = process.env.TEXTSPEED_TEMPLATE_ID;

/**
 * Sends an OTP via SMS using the TextSpeed API.
 * @param phone 10-digit phone number (without country code)
 * @param otp The OTP code to send
 */
export async function sendOTPViaSMS(phone: string, otp: string): Promise<void> {
    const message = `Dear customer, use this One Time Password ${otp} to log in to your Prrayasha Collections account. This OTP will be valid for the next 5 mins -PRRCOL`;

    const url = `${BASE_URL}/vb/apikey.php`;

    try {
        await axios.get(url, {
            params: {
                apikey: API_KEY,
                senderid: SENDER,
                number: `91${phone}`,
                message: message,
                route: 1,
                templateid: TEMPLATE_ID
            }
        });
    } catch (error: any) {
        console.error("Error sending SMS OTP via TextSpeed:", error?.response?.data || error.message);
        throw error;
    }
}
