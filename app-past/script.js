document.addEventListener('DOMContentLoaded', () => {
    const generateBtn = document.getElementById('generateBtn');

    generateBtn.addEventListener('click', generateConfig);

    // Also trigger on Ctrl+Enter in the textarea
    document.getElementById('customerInput').addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            generateConfig();
        }
    });
});

function generateConfig() {
    // 1. Get Inputs
    const rawText = document.getElementById('customerInput').value;
    const macRaw = document.getElementById('macInput').value;
    const serviceType = document.getElementById('serviceType').value;
    const interfaceStr = document.getElementById('interfaceInput').value;

    // New Inputs
    const ipAddress = document.getElementById('ipInput').value.trim();
    const portNum = document.getElementById('portInput').value.trim();

    // 2. Parse Customer Data
    const data = parseCustomerData(rawText);

    // 3. Process MAC Address — keep all alphanumeric, strip separators, take last 8 chars
    const macStripped = macRaw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const macClean = macStripped.slice(-8);

    // 4. Get VLAN ID
    const vlanMap = {
        '@fiberlink': 67,
        '@todayhome': 67,
        '@todayfiber': 63,
        '@todayplus': 67,
        '@sf': 64
    };
    const vlanId = vlanMap[serviceType] || 67; // Default to 67 if not found

    // 5. Extract ONU ID from Interface string
    // Case A: User inputs standard "GPON/EPON0/16:36" -> extract 36 (after last colon)
    // Case B: User inputs just "36" -> use 36 directly
    let onuId = '??';
    if (/^\d+$/.test(interfaceStr.trim())) {
        onuId = interfaceStr.trim();
    } else {
        const onuIdMatch = interfaceStr.match(/:(\d+)$/);
        if (onuIdMatch) onuId = onuIdMatch[1];
    }

    // 6. Format phone: strip 855 country code prefix and prepend 0
    let phone = data.phone;
    if (phone.startsWith('855') && phone.length > 9) {
        phone = '0' + phone.substring(3);
    }

    // If password was parsed from text, use it as fallback for phone
    if (data.password && (phone === 'N/A' || phone === '')) {
        phone = data.password;
        if (phone.startsWith('855') && phone.length > 9) {
            phone = '0' + phone.substring(3);
        }
    }

    // Determine Output Mode based on IP input presence
    let output1 = '';
    let output2 = '';

    if (ipAddress) {
        // --- IP MODE ---
        // Calculate Gateway (Assuming it's the .1 of the /22 or /24, usually just replace last octet with 1 for simple logic, 
        // but user example showed 10.168.168.173 -> GW 10.168.168.1. So taking the first 3 octects + .1)
        const ipParts = ipAddress.split('.');
        const gateway = (ipParts.length === 4) ? `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}.1` : 'N/A';
        const subnet = '255.255.252.0'; // Hardcoded per requirement/example
        const ipView = '103.216.48.130'; // Hardcoded per example

        // User Info Output (IP Mode)
        output1 = `Done Bong. Please help test!

ID: ${data.id}
Name: ${data.fullName}
IP :${ipAddress}
Sub : ${subnet}
GW : ${gateway}
Port : ${portNum}

IP view: ${ipView}

Thank you, Bong.`;

        // Command Output (IP Mode)
        // Note: User example showed mixed ONU IDs "onu 32" and "onu 23". 
        // I will assume valid ONU ID is the one from interface (onuId variable).
        output2 = `onu ${onuId} description ${data.id}-${data.name}
onu ${onuId} ctc eth 1 vlan pvid ${vlanId} pri 0
onu ${onuId} ctc eth 1 vlan mode tag

onu ${onuId} ctc eth 2 phy_ctrl enable
onu ${onuId} ctc eth 2 policy cir 10240 cbs 1024 ebs 1024 
onu ${onuId} ctc eth 2 rate_limit cir 10240 pir 1024 
onu ${onuId} ctc eth 2 vlan pvid 420 pri 0
onu ${onuId} ctc eth 2 vlan mode tag`;

    } else {
        // --- STANDARD MODE (PPPoE) ---
        // Determine username: use parsed username from text if MAC box is empty, else build from MAC
        let username = '';
        if (macClean === '' && data.username) {
            // Use the username from the pasted text
            username = data.username;
            // If DNS mode is on, ensure N is before @ (add it if not already there)
            if (dnsEnabled && username.includes('@')) {
                const atIndex = username.indexOf('@');
                if (username.charAt(atIndex - 1) !== 'N') {
                    username = username.substring(0, atIndex) + 'N' + username.substring(atIndex);
                }
            }
        } else {
            // Build username from MAC + service type
            username = `${macClean}${serviceType}`;
            if (dnsEnabled) {
                username = `${macClean}N${serviceType}`;
            }
        }

        // Build DNS string from full name (lowercase, no spaces, + .todayddns.com)
        let dnsLine = '';
        if (dnsEnabled && data.fullName !== 'N/A') {
            let dnsName = data.fullName;
            // Remove parenthetical part
            const parenIdx = dnsName.indexOf('(');
            if (parenIdx !== -1) {
                dnsName = dnsName.substring(0, parenIdx).trim();
            }
            // Remove title prefixes (Ms., Mr., Mrs., Dr., etc.)
            dnsName = dnsName.replace(/^(Ms|Mr|Mrs|Dr|Miss)\.?\s*/i, '');
            // Remove dots and spaces, lowercase
            dnsName = dnsName.toLowerCase().replace(/[.\s]+/g, '');
            dnsLine = `\nDNS : ${dnsName}.todayddns.com`;
        }

        // 7. Generate Output 1 (User Info)
        // Build info lines: keep Name and include Project/Room when available
        let infoLines = `Done Bong. Please help test!\n\nID: ${data.id}`;
        if (data.fullName !== 'N/A') {
            // New installation scenario: show Name + Username + Password
            infoLines += `\nName: ${data.fullName}`;
            infoLines += `\nUsername : ${username}      \nPassword : ${phone}${dnsLine}\n\nThank you, Bong.`;
        } else {
            // Processing scenario: show Project/Room + Username + Password
            if (data.project) {
                infoLines += `\nProject : ${data.project}`;
            }
            if (data.room) {
                infoLines += `\nRoom : ${data.room}`;
            }
            infoLines += `\nUsername : ${username}      \nPassword : ${phone}${dnsLine}\n\nThank you, Bong.`;
        }
        output1 = infoLines;

        // 7. Generate Output 2 (Command)
        // Use Room for description if Name is N/A but Room exists
        let descLabel = (data.name === 'N/A' && data.room) ? data.room : `${data.id}-${data.name}`;
        output2 = `onu ${onuId} description ${descLabel}
onu ${onuId} ctc eth 1 vlan pvid ${vlanId} pri 0
onu ${onuId} ctc eth 1 vlan mode tag`;
    }

    // 8. Render Outputs
    document.getElementById('output1').value = output1;
    document.getElementById('output2').value = output2;
}

function parseCustomerData(text) {
    const result = {
        id: 'N/A',
        name: 'N/A',
        fullName: 'N/A',
        phone: 'N/A',
        username: '',
        password: '',
        project: '',
        room: ''
    };

    if (!text) return result;

    // Regex for ID: matches "CID /ID: 113555" or "ID: Processing" (digits or text)
    const idMatch = text.match(/(?:CID\s*\/|C)?ID\s*[:.]?\s*([^\n\r]+)/i);
    if (idMatch) {
        let idVal = idMatch[1].trim();
        // Remove trailing fields that might be on the same line
        // If ID value starts with "ID:" again (like "ID: ID: Processing"), take the last part
        const doubleIdMatch = idVal.match(/^ID\s*[:.]?\s*(.+)/i);
        if (doubleIdMatch) idVal = doubleIdMatch[1].trim();
        result.id = idVal;
    }

    // Regex for Project: only from a dedicated line, require colon separator
    const projectMatch = text.match(/^\s*Project\s*[:\uFF1A]\s*([^\n\r]+)/im);
    if (projectMatch) result.project = projectMatch[1].trim();
    // Fallback: match "Project" followed by space + short value (e.g. "Project TC") but NOT address-like text
    if (!result.project) {
        const projectSpaceMatch = text.match(/^\s*Project\s+([A-Za-z0-9][A-Za-z0-9 ]{0,20})\s*$/im);
        if (projectSpaceMatch) result.project = projectSpaceMatch[1].trim();
    }

    // Regex for Room: only from a dedicated line
    const roomMatch = text.match(/^\s*Room(?:\s*[:\uFF1A]\s*|\s+)([^\n\r,]+)/im);
    if (roomMatch) result.room = roomMatch[1].trim();

    // Regex for Name: matches "Name: Prong Bora ( PCP A2708)"
    // Update: Enforce colon/dot to avoid matching "text box name..." in the first line
    // Regex for Name: Priority to "First Name" + "Last Name" (or "Surname") combo
    const firstNameMatch = text.match(/^\s*First\s*Name\s*[:.]?\s*([^\n\r]+)/im);
    const lastNameMatch = text.match(/^\s*(?:Last\s*Name|Surname)\s*[:.]?\s*([^\n\r]+)/im);

    if (firstNameMatch && lastNameMatch) {
        result.fullName = firstNameMatch[1].trim() + ' ' + lastNameMatch[1].trim();
    } else if (lastNameMatch) {
        result.fullName = lastNameMatch[1].trim();
    } else {
        const nameLineMatch = text.match(/^\s*Name\b\s*[:.]?\s*([^\n\r]+)/im);
        if (nameLineMatch) {
            result.fullName = nameLineMatch[1].trim();
        }
    }

    // name = last word only (for ONU description)
    // fullName = raw captured name (for User Info display)
    if (result.fullName !== 'N/A') {
        // Remove parenthetical for extracting last word
        let cleanName = result.fullName;
        const parenIndex = cleanName.indexOf('(');
        if (parenIndex !== -1) {
            cleanName = cleanName.substring(0, parenIndex).trim();
        }
        const words = cleanName.trim().split(/\s+/);
        result.name = words[words.length - 1];
    }

    // Regex for Phone: matches "Phone: 078666153"
    const phoneMatch = text.match(/Phone\s*[:.]?\s*(\d+)/i);
    if (phoneMatch) result.phone = phoneMatch[1];

    // Parse Username from text: matches "Username : 1917FB52N@fiberlink" or "Username: xxx@todayhome"
    const usernameMatch = text.match(/Username\s*[:.]?\s*([^\s|]+)/i);
    if (usernameMatch) result.username = usernameMatch[1].trim();

    // Parse Password from text: matches "Password : 012601100" or "Password: xxx"
    const passwordMatch = text.match(/Password\s*[:.]?\s*([^\s|]+)/i);
    if (passwordMatch) result.password = passwordMatch[1].trim();

    return result;
}

function copyToClipboard(elementId, btnElement) {
    const copyText = document.getElementById(elementId);

    // Select the text field
    copyText.select();
    copyText.setSelectionRange(0, 99999); // For mobile devices

    // Copy the text inside the text field
    navigator.clipboard.writeText(copyText.value).then(() => {
        // Visual Feedback
        const originalHtml = btnElement.innerHTML;
        // Simple feedback since we can't easily swap complex HTML inside the loop without more logic
        // But for this specific button structure:
        const isDark = document.documentElement.classList.contains('dark');

        btnElement.classList.add('text-green-500', 'border-green-500');
        if (!isDark) btnElement.classList.add('text-green-600', 'border-green-600');

        setTimeout(() => {
            btnElement.classList.remove('text-green-500', 'border-green-500', 'text-green-600', 'border-green-600');
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy: ', err);
    });
}

let ipcamEnabled = false;
let dnsEnabled = false;

function toggleIpcam() {
    ipcamEnabled = !ipcamEnabled;
    const fields = document.getElementById('ipcamFields');
    const toggleBtn = document.getElementById('ipcamToggle');
    const dot = document.getElementById('ipcamDot');
    const isDark = document.documentElement.classList.contains('dark');

    if (ipcamEnabled) {
        // Show fields
        fields.classList.remove('hidden');
        // Toggle button ON style
        toggleBtn.classList.remove('bg-slate-300', 'dark:bg-slate-800');
        toggleBtn.classList.add('bg-blue-600', 'dark:bg-green-700');
        // Move dot to right
        dot.classList.remove('left-0.5');
        dot.classList.add('left-[26px]');
        dot.classList.remove('dark:bg-green-900');
        dot.classList.add('dark:bg-green-400');
    } else {
        // Hide fields
        fields.classList.add('hidden');
        // Toggle button OFF style
        toggleBtn.classList.remove('bg-blue-600', 'dark:bg-green-700');
        toggleBtn.classList.add('bg-slate-300', 'dark:bg-slate-800');
        // Move dot to left
        dot.classList.remove('left-[26px]');
        dot.classList.add('left-0.5');
        dot.classList.remove('dark:bg-green-400');
        dot.classList.add('dark:bg-green-900');
        // Clear IP and Port values
        document.getElementById('ipInput').value = '';
        document.getElementById('portInput').value = '';
    }
}

function toggleDns() {
    dnsEnabled = !dnsEnabled;
    const toggleBtn = document.getElementById('dnsToggle');
    const dot = document.getElementById('dnsDot');

    if (dnsEnabled) {
        toggleBtn.classList.remove('bg-slate-300', 'dark:bg-slate-800');
        toggleBtn.classList.add('bg-blue-600', 'dark:bg-green-700');
        dot.classList.remove('left-0.5');
        dot.classList.add('left-[26px]');
        dot.classList.remove('dark:bg-green-900');
        dot.classList.add('dark:bg-green-400');
    } else {
        toggleBtn.classList.remove('bg-blue-600', 'dark:bg-green-700');
        toggleBtn.classList.add('bg-slate-300', 'dark:bg-slate-800');
        dot.classList.remove('left-[26px]');
        dot.classList.add('left-0.5');
        dot.classList.remove('dark:bg-green-400');
        dot.classList.add('dark:bg-green-900');
    }
}
