// Admin Dashboard Logic
const FIREBASE_API_KEY = 'AIzaSyArd6_mtR0se_x8SsEacfM8FX7Y5FHsXIU';

document.addEventListener('DOMContentLoaded', () => {
    checkAuth(async (user) => {
        const isAdmin = await checkAdmin(user);
        if (!isAdmin) {
            window.location.href = 'index.html';
            return;
        }
        document.getElementById('adminEmail').textContent = user.email;
        loadUsers();
    });
});

// Load all users from Firestore
async function loadUsers() {
    const tbody = document.getElementById('usersTable');
    tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-green-700">Loading...</td></tr>';

    try {
        const snapshot = await db.collection('users').orderBy('createdAt', 'desc').get();
        tbody.innerHTML = '';

        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-green-700">No users found</td></tr>';
            return;
        }

        snapshot.forEach((doc) => {
            const data = doc.data();
            const row = document.createElement('tr');
            row.className = 'border-b border-green-900/50 hover:bg-green-900/10 transition-colors';

            const created = data.createdAt ? data.createdAt.toDate().toLocaleDateString() : 'N/A';
            const isCurrentUser = doc.id === auth.currentUser.uid;

            row.innerHTML = `
                <td class="p-3 text-xs">${data.username || '-'}</td>
                <td class="p-3 text-xs">${data.email || 'N/A'}</td>
                <td class="p-3 text-xs">
                    <select onchange="changeRole('${doc.id}', this.value)" 
                        class="bg-black border border-green-800 text-green-400 text-xs px-2 py-1 focus:border-green-500 focus:outline-none"
                        ${isCurrentUser ? 'disabled' : ''}>
                        <option value="user" ${data.role === 'user' ? 'selected' : ''}>User</option>
                        <option value="admin" ${data.role === 'admin' ? 'selected' : ''}>Admin</option>
                    </select>
                </td>
                <td class="p-3 text-xs text-green-700">${created}</td>
                <td class="p-3 text-xs">
                    ${isCurrentUser
                    ? '<span class="text-green-700">[YOU]</span>'
                    : `<button onclick="deleteUser('${doc.id}', '${data.email}')" 
                            class="text-red-500 hover:text-red-400 border border-red-800 px-2 py-1 hover:bg-red-900/30 transition-colors text-xs">
                            DELETE
                           </button>`
                }
                </td>
            `;
            tbody.appendChild(row);
        });

        document.getElementById('userCount').textContent = snapshot.size;
    } catch (err) {
        console.error('Error loading users:', err);
        tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-red-400">Error: ${err.message}</td></tr>`;
    }
}

// Change user role
async function changeRole(uid, newRole) {
    try {
        await db.collection('users').doc(uid).update({ role: newRole });
        showAdminMsg(`Role updated to ${newRole.toUpperCase()}`, 'success');
    } catch (err) {
        showAdminMsg('Failed to update role: ' + err.message, 'error');
        loadUsers();
    }
}

// Delete user document from Firestore
async function deleteUser(uid, email) {
    if (!confirm(`Delete user ${email}? They will no longer be able to access the app.`)) return;

    try {
        await db.collection('users').doc(uid).delete();
        showAdminMsg(`User ${email} removed`, 'success');
        loadUsers();
    } catch (err) {
        showAdminMsg('Failed to delete: ' + err.message, 'error');
    }
}

// Create new user via Firebase REST API (doesn't sign out the admin)
async function createUser() {
    const username = document.getElementById('newUsername').value.trim();
    const email = document.getElementById('newUserEmail').value.trim();
    const password = document.getElementById('newUserPassword').value.trim();
    const role = document.getElementById('newUserRole').value;

    if (!username || !email || !password) {
        showAdminMsg('Please fill in all fields', 'error');
        return;
    }
    if (password.length < 6) {
        showAdminMsg('Password must be at least 6 characters', 'error');
        return;
    }

    // Check if username already taken
    const existingUser = await db.collection('usernames').doc(username.toLowerCase()).get();
    if (existingUser.exists) {
        showAdminMsg('Username already taken', 'error');
        return;
    }

    const btn = document.querySelector('#createUserSection button');
    btn.textContent = 'CREATING...';
    btn.disabled = true;

    try {
        // Use Firebase Auth REST API to create user without signing in as them
        const response = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: email,
                    password: password,
                    returnSecureToken: false
                })
            }
        );

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message);
        }

        // Create Firestore document for the new user
        await db.collection('users').doc(data.localId).set({
            username: username,
            email: email,
            role: role,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: auth.currentUser.email
        });

        // Create username -> email mapping for login lookup
        await db.collection('usernames').doc(username.toLowerCase()).set({
            email: email,
            uid: data.localId
        });

        showAdminMsg(`User ${username} (${email}) created as ${role.toUpperCase()}`, 'success');
        document.getElementById('newUsername').value = '';
        document.getElementById('newUserEmail').value = '';
        document.getElementById('newUserPassword').value = '';
        loadUsers();

    } catch (err) {
        let msg = err.message;
        if (msg.includes('EMAIL_EXISTS')) msg = 'Email already registered';
        if (msg.includes('WEAK_PASSWORD')) msg = 'Password too weak (min 6 chars)';
        if (msg.includes('INVALID_EMAIL')) msg = 'Invalid email format';
        showAdminMsg('Failed: ' + msg, 'error');
    }

    btn.textContent = 'CREATE';
    btn.disabled = false;
}

function showAdminMsg(msg, type) {
    const el = document.getElementById('adminMsg');
    el.textContent = (type === 'error' ? '⚠ ' : '✓ ') + msg;
    el.className = `mb-4 p-3 border text-xs tracking-wider ${type === 'error'
        ? 'border-red-800 bg-red-900/20 text-red-400'
        : 'border-green-800 bg-green-900/20 text-green-400'
        }`;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 4000);
}
