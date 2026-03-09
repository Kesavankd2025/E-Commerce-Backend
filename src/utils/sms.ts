import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config({ quiet: true })

const API_KEY = process.env.SMS_API_KEY;
const SENDER_ID = process.env.SMS_SENDER_ID;
const WELCOME_TEMPLATE_ID = process.env.SMS_WELCOME_TEMPLATE_ID;
const FORGOT_PIN_TEMPLATE_ID = process.env.SMS_FORGOT_PIN_TEMPLATE_ID;
const SMS_URL = `https://sms.promptbulksms.com/api/smsapi`;

export const sendWelcomeSMS = async (name: string, phoneNumber: string, pin: string) => {
    try {
        if (!API_KEY || !SENDER_ID || !WELCOME_TEMPLATE_ID) {
            console.error('SMS configuration missing in environment variables');
            return null;
        }

        let message = `Congratulations!

Dear ${name}

Warm welcome to CNI !

Your application has been approved successfully.

Login Details : CNI Business Forum Application

Username: ${phoneNumber}

Password: ${pin}

 Please log in and change your password after first login for security.

CNI wishes you a successful journey ahead!

PROMPT`;

        const response = await axios.get(SMS_URL, {
            params: {
                key: API_KEY,
                route: 1,
                sender: SENDER_ID,
                number: phoneNumber,
                sms: message,
                templateid: WELCOME_TEMPLATE_ID
            }
        });

        console.log('SMS Response:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error sending SMS:', error);
        return null;
    }
};

export const sendOTPSMS = async (phoneNumber: string, otp: string, expiryMinutes: number = 5) => {
    try {
        if (!API_KEY || !SENDER_ID || !FORGOT_PIN_TEMPLATE_ID) {
            console.error('SMS configuration missing in environment variables');
            return null;
        }

        let message = `Dear CNI Member,

Your OTP to reset your CNI Business Forum Application is ${otp}.

Valid for ${expiryMinutes} minutes.

Do not share it with anyone.

CNI - PROMPT`;

        const response = await axios.get(SMS_URL, {
            params: {
                key: API_KEY,
                route: 1,
                sender: SENDER_ID,
                number: phoneNumber,
                sms: message,
                templateid: FORGOT_PIN_TEMPLATE_ID
            }
        });

        console.log('OTP SMS Response:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error sending OTP SMS:', error);
        return null;
    }
};

export const sendVisitorSMS = async (
    visitorName: string,
    phoneNumber: string,
    memberName: string,
    chapterName: string
) => {
    try {
        if (!API_KEY || !SENDER_ID) {
            console.error('SMS configuration missing in environment variables');
            return null;
        }

        const templateId = "1707177149429798445";

        let message = `Dear ${visitorName} ,

Greetings from CNI.

Our member ${memberName} has invited you as a visitor to the upcoming ${chapterName} Chapter meeting. We look forward to your presence and participation.

Warm regards,
CNI Team`;

        const response = await axios.get(SMS_URL, {
            params: {
                key: API_KEY,
                route: 1,
                sender: SENDER_ID,
                number: phoneNumber,
                sms: message,
                templateid: templateId
            }
        });

        console.log('Visitor SMS Response:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error sending Visitor SMS:', error);
        return null;
    }
};

export const sendExpirySMS = async (name: string, phoneNumber: string, expiryDate: string) => {
    try {
        if (!API_KEY || !SENDER_ID) {
            console.error('SMS configuration missing in environment variables');
            return null;
        }

        const templateId = "1707177149455685534";

        let message = `Dear ${name} ,

This is to inform you that your CNI membership subscription will expire on ${expiryDate}.

We kindly request you to renew your subscription on or before the expiry date to continue enjoying uninterrupted membership benefits.

For further information or assistance, please feel free to reach out to the CNI Team.

Warm regards,
CNI Team`;

        const response = await axios.get(SMS_URL, {
            params: {
                key: API_KEY,
                route: 1,
                sender: SENDER_ID,
                number: phoneNumber,
                sms: message,
                templateid: templateId
            }
        });

        console.log('Expiry SMS Response:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error sending Expiry SMS:', error);
        return null;
    }
};

export const sendChiefGuestAssignmentSMS = async (
    guestName: string,
    phoneNumber: string,
    memberName: string,
    chapterName: string
) => {
    try {
        if (!API_KEY || !SENDER_ID) {
            console.error('SMS configuration missing in environment variables');
            return null;
        }

        const templateId = "1707177149447803548";

        const message = `Dear ${guestName} ,

Greetings from CNI.

It is our pleasure to inform you that our member ${memberName} has invited you as the Chief Guest for the upcoming ${chapterName} Chapter meeting.

We would be honored by your presence and look forward to your valuable insights and participation at the event.

Warm regards,
CNI Team`;

        const response = await axios.get(SMS_URL, {
            params: {
                key: API_KEY,
                route: 1,
                sender: SENDER_ID,
                number: phoneNumber,
                sms: message,
                templateid: templateId
            }
        });

        console.log('Chief Guest Assignment SMS Response:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error sending Chief Guest Assignment SMS:', error);
        return null;
    }
};
