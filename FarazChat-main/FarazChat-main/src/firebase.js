import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB2Oj0ACO2Tkc6rU-42aENQOrfyUvRjJ_I",
  authDomain: "farazchat-2fdea.firebaseapp.com",
  projectId: "farazchat-2fdea",
  storageBucket: "farazchat-2fdea.firebasestorage.app",
  messagingSenderId: "372286305112",
  appId: "1:372286305112:web:9a42f6b0f56d4426112b2d"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
