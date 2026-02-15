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
        output1 = `Done Bong. please help test!
ID : ${data.id}
Name: ${data.name}
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

onu ${onuId} ctc eth 2 phy ctrl enable
onu ${onuId} ctc eth 2 policy cir 10240 cbs 1024 ebs 1024 
onu ${onuId} ctc eth 2 rate limit cir 10240 pir 1024 
onu ${onuId} ctc eth 2 vlan pvid 420 pri 0
onu ${onuId} ctc eth 2 vlan mode tag`;

    } else {
        // --- STANDARD MODE (PPPoE) ---
        // 7. Generate Output 1 (User Info)
        output1 = `Done Bong. Please help test!

ID: ${data.id}
Name: ${data.name}
Username : ${macClean}${serviceType}      
Password : ${phone}

Thank you, Bong.`;

        // 7. Generate Output 2 (Command)
        output2 = `onu ${onuId} description ${data.id}-${data.name}
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
        phone: 'N/A'
    };

    if (!text) return result;

    // Regex for ID: matches "CID /ID: 113555" or "ID: 113555"
    // Looks for "ID" followed by optional colon, spaces, and then digits
    const idMatch = text.match(/(?:CID\s*\/|C)?ID\s*[:.]?\s*(\d+)/i);
    if (idMatch) result.id = idMatch[1];

    // Regex for Name: matches "Name: Prong Bora ( PCP A2708)"
    // Update: Enforce colon/dot to avoid matching "text box name..." in the first line
    // Regex for Name: Priority to "First Name" + "Last Name" (or "Surname") combo
    const firstNameMatch = text.match(/First\s*Name\s*[:.]?\s*([^\n\r]+)/i);
    const lastNameMatch = text.match(/(?:Last\s*Name|Surname)\s*[:.]?\s*([^\n\r]+)/i);

    if (firstNameMatch && lastNameMatch) {
        // Found both? Combine them
        result.name = firstNameMatch[1].trim() + ' ' + lastNameMatch[1].trim();
    } else if (lastNameMatch) {
        // Found only Last Name? Use it (User specifically asked to catch last name)
        result.name = lastNameMatch[1].trim();
    } else {
        // Fallback: matches "Name: ...", "Customer Name: ...", "Full Name: ..."
        // Note: This also matches "First Name: ..." if proper First/Last detection failed, which is acceptable
        const nameLineMatch = text.match(/Name\s*[:.]?\s*([^\n\r]+)/i);
        if (nameLineMatch) {
            let rawName = nameLineMatch[1].trim();
            // Stop at the first parenthesis if it exists (for comments like "( PCP...)")
            const parenIndex = rawName.indexOf('(');
            if (parenIndex !== -1) {
                rawName = rawName.substring(0, parenIndex).trim();
            }
            result.name = rawName;
        }
    }

    // Regex for Phone: matches "Phone: 078666153"
    const phoneMatch = text.match(/Phone\s*[:.]?\s*(\d+)/i);
    if (phoneMatch) result.phone = phoneMatch[1];

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
