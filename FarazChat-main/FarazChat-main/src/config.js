// Hardcoded server configuration
// Pehle ye URL apne server ka URL set kar de
// Example: https://chat.yourdomain.com
// Ya agar local testing hai: http://192.168.1.YOUR_IP:3000

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://chat.example.com';

// Agar local network mein test karna hai to:
// export const API_BASE_URL = 'http://192.168.1.10:3000';  // apne PC ka IP daal

// Mobile mein native app ke liye HTTPS zaroori hai
// Localhost ke samay HTTP use kar sakta hai sirf local testing mein
