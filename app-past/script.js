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

        // Command Output (IP Mode) - only if ONU ID is valid
        if (onuId !== '??') {
            output2 = `onu ${onuId} description ${data.id}-${data.name}
onu ${onuId} ctc eth 1 vlan pvid ${vlanId} pri 0
onu ${onuId} ctc eth 1 vlan mode tag

onu ${onuId} ctc eth 2 phy_ctrl enable
onu ${onuId} ctc eth 2 policy cir 10240 cbs 1024 ebs 1024 
onu ${onuId} ctc eth 2 rate_limit cir 10240 pir 1024 
onu ${onuId} ctc eth 2 vlan pvid 420 pri 0
onu ${onuId} ctc eth 2 vlan mode tag`;
        }

    } else if (infraTctEnabled) {
        // --- INFRA-TCT MODE ---
        const orderCode = serviceType; // Value from dropdown (e.g., "2422")
        const tctVlanMap = {
            '2422': '65',
            '2423': '317',
            '2424': '420',
            '2425': 'N/A', // China Route
            '2426': 'N/A'  // DPLC
        };
        const vlan = tctVlanMap[orderCode] || 'N/A';

        // Username: Last 8 chars of SN (entered in MAC field) + @fiberlink
        // Use macStripped instead of macClean if we want to ensure we take from the input even if short? 
        // But macClean is last 8. Let's assume input SN is long enough.
        const snLast8 = macStripped.slice(-8);
        const username = `${snLast8}@fiberlink`;

        // Output 1: OUTPUT_OUR_TEAM
        // Use parsed project/ODN code if available (e.g. Telcotech-TD0324), otherwise fallback to orderCode
        const footerInfo = data.project || orderCode;

        output1 = `Done Bong. Please help test!

ID: ${data.id}
Name: ${data.fullName}
Username: ${username}
Password: ${phone}
${footerInfo}

Thank you, Bong.`;

        // Output 2: TO_TCT Group
        // Removed VLAN line as requested
        output2 = `Dear bong, please activate this customer new installation

Order: ${orderCode}
Mode: Bridge

SN: ${macRaw.trim()}`;

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
        // ID and Name always appear in output
        let infoLines = `Done Bong. Please help test!\n\nID: ${data.id}`;
        infoLines += `\nName: ${data.fullName}`;
        if (data.fullName === 'N/A') {
            // Processing scenario: also show Project/Room when Name is not available
            if (data.project) {
                infoLines += `\nProject : ${data.project}`;
            }
            if (data.room) {
                infoLines += `\nRoom : ${data.room}`;
            }
        }
        infoLines += `\nUsername : ${username}      \nPassword : ${phone}${dnsLine}\n\nThank you, Bong.`;
        output1 = infoLines;

        // 7. Generate Output 2 (Command) - only if ONU ID is valid
        if (onuId !== '??') {
            // Use Room for description if Name is N/A but Room exists
            let descLabel = (data.name === 'N/A' && data.room) ? data.room : `${data.id}-${data.name}`;
            output2 = `onu ${onuId} description ${descLabel}
onu ${onuId} ctc eth 1 vlan pvid ${vlanId} pri 0
onu ${onuId} ctc eth 1 vlan mode tag`;
        }
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
    // Fallback: match "Telcotech-..." style codes (robust match)
    if (!result.project) {
        // Matches "Telcotech-TD0324", "Telcotech - TD0324", etc.
        const telcotechMatch = text.match(/(Telcotech\s*-\s*[A-Z0-9]+)/i);
        if (telcotechMatch) {
            // Normalize to remove spaces if needed, or just keep as is
            result.project = telcotechMatch[1].replace(/\s+/g, '');
        }
    }

    // Regex for Room: only from a dedicated line
    const roomMatch = text.match(/^\s*Room(?:\s*[:\uFF1A]\s*|\s+)([^\n\r,]+)/im);
    if (roomMatch) result.room = roomMatch[1].trim();

    return result;
}

// Auto-resize textarea logic
function autoResizeTextarea() {
    const textarea = document.getElementById('customerInput');
    textarea.style.height = 'auto'; // Reset height
    textarea.style.height = (textarea.scrollHeight + 2) + 'px'; // Set to scroll height + border buffer
}

document.addEventListener('DOMContentLoaded', () => {
    // ... existing listeners ...
    const textarea = document.getElementById('customerInput');
    if (textarea) {
        // Enforce no scrollbar
        textarea.style.overflowY = 'hidden';

        textarea.addEventListener('input', autoResizeTextarea);
        textarea.addEventListener('focus', autoResizeTextarea);
        textarea.addEventListener('change', autoResizeTextarea);

        // Initial resize
        setTimeout(autoResizeTextarea, 100);
    }
});
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

function updateInterfaceInput() {
    const prefix = document.getElementById('interfacePrefix').value;
    const input = document.getElementById('interfaceInput');
    const currentVal = input.value;

    // Remove any existing prefix (EPON/0:, GPON/0:, EPON0/1:, GPON0/1:) globally and keep the number part
    const numberPart = currentVal.replace(/(EPON|GPON)(\/0:|0\/1:)/gi, '').trim();

    // Set new value with selected prefix + existing number
    input.value = prefix + numberPart;

    // Focus the input so user can type the number right away
    input.focus();
}

function copyInterfaceValue(btnElement) {
    const value = document.getElementById('interfaceInput').value;
    navigator.clipboard.writeText(value).then(() => {
        // Visual feedback
        btnElement.classList.add('text-green-500', 'border-green-500');
        setTimeout(() => {
            btnElement.classList.remove('text-green-500', 'border-green-500');
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy: ', err);
    });
}

let infraTctEnabled = false;

function toggleInfraTct() {
    infraTctEnabled = !infraTctEnabled;
    const btn = document.getElementById('infraTctBtn');
    const serviceSelect = document.getElementById('serviceType');

    // Labels
    const lblMacLight = document.getElementById('lblMacLight');
    const lblMacDark = document.getElementById('lblMacDark');
    const lblUserInfoLight = document.getElementById('lblUserInfoLight');
    const lblUserInfoDark = document.getElementById('lblUserInfoDark');
    const lblCommandLight = document.getElementById('lblCommandLight');
    const lblCommandDark = document.getElementById('lblCommandDark');

    if (infraTctEnabled) {
        // Active State Style
        btn.classList.add('bg-green-900', 'text-green-400', 'border-green-500', 'shadow-[0_0_10px_rgba(34,197,94,0.5)]');
        btn.classList.remove('text-slate-400', 'border-slate-600', 'dark:text-green-800', 'dark:border-green-900');

        // Update Labels
        lblMacLight.innerText = 'SN';
        lblMacDark.innerText = '>> SN';
        lblUserInfoLight.innerText = 'OUTPUT_OUR_TEAM';
        lblUserInfoDark.innerText = '>> OUTPUT_OUR_TEAM';
        lblCommandLight.innerText = 'TO_TCT Group';
        lblCommandDark.innerText = '>> TO_TCT Group';

        // Swap Dropdown Options
        serviceSelect.innerHTML = `
            <option value="2422">2422 (PPPoE)</option>
            <option value="2423">2423 (GLAN)</option>
            <option value="2424">2424 (IPCAM)</option>
            <option value="2425">2425 (China Route)</option>
            <option value="2426">2426 (DPLC)</option>
        `;
    } else {
        // Inactive State Style
        btn.classList.remove('bg-green-900', 'text-green-400', 'border-green-500', 'shadow-[0_0_10px_rgba(34,197,94,0.5)]');
        btn.classList.add('text-slate-400', 'border-slate-600', 'dark:text-green-800', 'dark:border-green-900');

        // Revert Labels
        lblMacLight.innerText = 'MAC Address';
        lblMacDark.innerText = '>> MAC Address';
        lblUserInfoLight.innerText = 'User Info';
        lblUserInfoDark.innerText = '>> User_Info_Output';
        lblCommandLight.innerText = 'Command';
        lblCommandDark.innerText = '>> Command_Line_Output';

        // Revert Dropdown Options
        serviceSelect.innerHTML = `
            <option value="@fiberlink">@fiberlink</option>
            <option value="@todayhome">@todayhome</option>
            <option value="@todayfiber">@todayfiber</option>
            <option value="@todayplus">@todayplus</option>
            <option value="@sf">@sf</option>
        `;
    }
}
