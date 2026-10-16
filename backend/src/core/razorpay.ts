import Razorpay from 'razorpay';

// Single shared client. Reads keys from env — never hardcode, never log these.
export const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});
