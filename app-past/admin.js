// Admin Dashboard Logic

document.addEventListener('DOMContentLoaded', () => {
    // Check auth and admin status
    checkAuth(async (user) => {
        const isAdmin = await checkAdmin(user);
        if (!isAdmin) {
            // Not admin — redirect to main app
            window.location.href = 'index.html';
            return;
        }

        // Show admin email
        document.getElementById('adminEmail').textContent = user.email;

        // Load users
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
            tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-green-700">No users found</td></tr>';
            return;
        }

        snapshot.forEach((doc) => {
            const data = doc.data();
            const row = document.createElement('tr');
            row.className = 'border-b border-green-900/50 hover:bg-green-900/10 transition-colors';

            const created = data.createdAt ? data.createdAt.toDate().toLocaleDateString() : 'N/A';
            const isCurrentUser = doc.id === auth.currentUser.uid;

            row.innerHTML = `
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

        // Update user count
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
        loadUsers(); // Reload to revert UI
    }
}

// Delete user document from Firestore
async function deleteUser(uid, email) {
    if (!confirm(`Delete user ${email}? This removes their access.`)) return;

    try {
        await db.collection('users').doc(uid).delete();
        showAdminMsg(`User ${email} deleted`, 'success');
        loadUsers();
    } catch (err) {
        showAdminMsg('Failed to delete: ' + err.message, 'error');
    }
}

// Create new user — Note: Firebase client SDK can't create users without signing in as them
// So we create the Firestore doc and the user must sign up via the login page
// For admin convenience, we provide a "pre-register" that creates the Firestore doc
async function preRegisterUser() {
    const email = document.getElementById('newUserEmail').value.trim();
    const role = document.getElementById('newUserRole').value;

    if (!email) {
        showAdminMsg('Please enter an email', 'error');
        return;
    }

    try {
        // Create a placeholder doc with email as key
        await db.collection('preRegistered').doc(email).set({
            email: email,
            role: role,
            createdBy: auth.currentUser.email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        showAdminMsg(`Pre-registered ${email} as ${role.toUpperCase()}. They can now sign up.`, 'success');
        document.getElementById('newUserEmail').value = '';
    } catch (err) {
        showAdminMsg('Failed: ' + err.message, 'error');
    }
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
