// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyArd6_mtR0se_x8SsEacfM8FX7Y5FHsXIU",
    authDomain: "sb-generator.firebaseapp.com",
    projectId: "sb-generator",
    storageBucket: "sb-generator.firebasestorage.app",
    messagingSenderId: "907351389604",
    appId: "1:907351389604:web:390cdc27547bb788f6bd31"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Check if user is logged in, redirect to login if not
function checkAuth(callback) {
    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }
        if (callback) callback(user);
    });
}

// Check if current user is admin
async function checkAdmin(user) {
    try {
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            return doc.data().role === 'admin';
        }
        return false;
    } catch (e) {
        console.error('Error checking admin status:', e);
        return false;
    }
}

// Logout
function logout() {
    auth.signOut().then(() => {
        window.location.href = 'login.html';
    });
}

// Create user document in Firestore (called on first login)
async function ensureUserDoc(user) {
    const docRef = db.collection('users').doc(user.uid);
    const doc = await docRef.get();
    if (!doc.exists) {
        await docRef.set({
            email: user.email,
            role: 'user',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
}
