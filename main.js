import { convertFile } from './converter.js';
import { saveAs } from 'file-saver';

// DOM Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileListContainer = document.getElementById('file-list-container');
const fileList = document.getElementById('file-list');
const globalFormatSelect = document.getElementById('global-format-select');
const convertAllBtn = document.getElementById('convert-all-btn');
const clearAllBtn = document.getElementById('clear-all-btn');

// Conversion Rules
const CONVERSION_RULES = {
    'image': [
        { value: 'image/jpeg', label: 'JPEG' },
        { value: 'image/png', label: 'PNG' },
        { value: 'image/webp', label: 'WebP' },
        { value: 'image/bmp', label: 'BMP' },
        { value: 'image/gif', label: 'GIF' },
        { value: 'application/pdf', label: 'PDF' }
    ],
    'document': [
        { value: 'application/pdf', label: 'PDF' },
        { value: 'text/html', label: 'HTML' }
    ],
    'spreadsheet': [
        { value: 'application/pdf', label: 'PDF' },
        { value: 'text/csv', label: 'CSV' },
        { value: 'text/html', label: 'HTML' }
    ],
    'text': [
        { value: 'application/pdf', label: 'PDF' },
        { value: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'DOCX (Basic)' }
    ],
    'pdf': [
        { value: 'text/plain', label: 'Text (TXT)' }
    ]
};

function getFileCategory(file) {
    const name = file.name.toLowerCase();
    const type = file.type;

    if (type.startsWith('image/') || name.endsWith('.heic') || name.endsWith('.heif') || name.endsWith('.tiff') || name.endsWith('.tif')) {
        return 'image';
    }
    if (name.endsWith('.docx') || name.endsWith('.doc')) {
        return 'document';
    }
    if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv') || name.endsWith('.ods')) {
        return 'spreadsheet';
    }
    if (type.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.html') || name.endsWith('.rtf')) {
        return 'text';
    }
    if (type === 'application/pdf' || name.endsWith('.pdf')) {
        return 'pdf';
    }
    return null;
}

function getCompatibleFormats(file) {
    const category = getFileCategory(file);
    return CONVERSION_RULES[category] || [];
}

// State
let files = []; // Array of { id, file, targetFormat, status, resultBlob }

// Event Listeners
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', handleDrop);
fileInput.addEventListener('change', handleFileSelect);

globalFormatSelect.addEventListener('change', updateAllFormats);
convertAllBtn.addEventListener('click', convertAllFiles);
clearAllBtn.addEventListener('click', clearAllFiles);

// Handlers
function handleDrop(e) {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
}

function handleFileSelect(e) {
    const selectedFiles = Array.from(e.target.files);
    addFiles(selectedFiles);
    fileInput.value = ''; // Reset input to allow same file selection again
}

function addFiles(newFiles) {
    if (newFiles.length === 0) return;

    const supportedTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp',
        'image/tiff', 'image/svg+xml', 'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel', // .xls
        'text/csv', 'text/plain', 'text/html'
    ];

    const supportedExtensions = ['.heic', '.heif', '.tiff', '.tif', '.docx', '.xlsx', '.xls', '.csv', '.txt', '.html'];

    const validFiles = [];
    let hasUnsupported = false;

    newFiles.forEach(file => {
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        // Check mime type OR extension (mime types can be tricky/missing)
        if (supportedTypes.includes(file.type) || supportedExtensions.includes(ext) || file.type.startsWith('image/')) {
            validFiles.push(file);
        } else {
            hasUnsupported = true;
        }
    });

    if (hasUnsupported) {
        alert("Unsupported Format: Only images and documents (DOCX, XLS, PDF, TXT) are allowed.");
    }

    if (validFiles.length === 0) return;

    validFiles.forEach(file => {
        const id = Date.now() + Math.random().toString(36).substr(2, 9);
        // Default target? Maybe none initially, or first compatible.
        // Let's set it to empty and let user choose, or auto-pick first.
        // Auto-picking first is nice.
        const compatible = getCompatibleFormats(file);
        const defaultTarget = compatible.length > 0 ? compatible[0].value : '';

        files.push({
            id,
            file,
            targetFormat: defaultTarget,
            status: 'pending',
            resultBlob: null
        });
    });

    renderFileList();
    updateUIState();
    updateGlobalFormatOptions(); // Update global dropdown based on current mix
}

function updateUIState() {
    if (files.length > 0) {
        fileListContainer.classList.remove('hidden');
    } else {
        fileListContainer.classList.add('hidden');
    }

    // Enable convert button if at least one file has a target format and is pending
    const canConvert = files.some(f => f.status === 'pending' && f.targetFormat);
    convertAllBtn.disabled = !canConvert;

    // Update button text to reflect state
    const convertingCount = files.filter(f => f.status === 'converting').length;
    if (convertingCount > 0) {
        convertAllBtn.textContent = `Converting (${convertingCount})...`;
        convertAllBtn.disabled = true;
    } else {
        convertAllBtn.textContent = 'Convert All';
    }
}

function updateGlobalFormatOptions() {
    if (files.length === 0) {
        globalFormatSelect.innerHTML = '<option value="" selected>Convert All to...</option>';
        globalFormatSelect.disabled = true;
        return;
    }

    // Find intersection of all compatible formats for pending files
    const pendingFiles = files.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) {
        globalFormatSelect.innerHTML = '<option value="" selected>Convert All to...</option>';
        globalFormatSelect.disabled = true;
        return;
    }

    const firstFileFormats = getCompatibleFormats(pendingFiles[0]).map(f => f.value);
    let commonFormats = new Set(firstFileFormats);

    for (let i = 1; i < pendingFiles.length; i++) {
        const currentFormats = new Set(getCompatibleFormats(pendingFiles[i]).map(f => f.value));
        commonFormats = new Set([...commonFormats].filter(x => currentFormats.has(x)));
    }

    // Rebuild global select
    globalFormatSelect.innerHTML = '<option value="" selected>Convert All to...</option>';

    if (commonFormats.size === 0) {
        globalFormatSelect.disabled = true;
        // Maybe add a disabled option saying "No common formats"
        const opt = document.createElement('option');
        opt.text = "No common formats";
        opt.disabled = true;
        globalFormatSelect.appendChild(opt);
    } else {
        globalFormatSelect.disabled = false;
        // We need labels. We can look them up from any rule set that has them.
        // Or just map known values to labels.
        const allOptionsMap = {};
        Object.values(CONVERSION_RULES).flat().forEach(opt => {
            allOptionsMap[opt.value] = opt.label;
        });

        commonFormats.forEach(val => {
            const opt = document.createElement('option');
            opt.value = val;
            opt.text = allOptionsMap[val] || val;
            globalFormatSelect.appendChild(opt);
        });
    }
}

function renderFileList() {
    fileList.innerHTML = '';
    files.forEach(fileObj => {
        const li = document.createElement('li');
        li.className = 'file-item';

        // Preview handling
        let previewSrc = '';
        if (fileObj.file.type.startsWith('image/')) {
            previewSrc = URL.createObjectURL(fileObj.file);
        } else {
            previewSrc = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM5NGEzYjgiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMTMgMmgyYTIgMiAwIDAgMSAybTJ2NGgyIi8+PHBvbHlsaW5lIHBvaW50cz0iMTcgOCAxMiAzIDcgOCIvPjxsaW5lIHgxPSIxMiIgeTE9IjMiIHgyPSIxMiIgeTI9IjE1Ii8+PC9zdmc+'; // Simple file icon
        }

        const fileSize = (fileObj.file.size / 1024).toFixed(1) + ' KB';

        // Action area content depends on status
        let actionContent = '';
        if (fileObj.status === 'done') {
            actionContent = `
                <span class="status-badge status-done">Done</span>
                <button class="btn-primary" onclick="downloadFile('${fileObj.id}')">Download</button>
            `;
        } else if (fileObj.status === 'error') {
            actionContent = `
                <span class="status-badge status-error">Error</span>
            `;
        } else if (fileObj.status === 'converting') {
            actionContent = `
                <span class="status-badge status-converting">Running...</span>
            `;
        } else {
            // Generate dynamic options
            const compatible = getCompatibleFormats(fileObj.file);
            const optionsHtml = compatible.map(opt =>
                `<option value="${opt.value}" ${fileObj.targetFormat === opt.value ? 'selected' : ''}>${opt.label}</option>`
            ).join('');

            actionContent = `
                <select class="item-format-select" onchange="updateFileFormat('${fileObj.id}', this.value)">
                    <option value="" disabled ${!fileObj.targetFormat ? 'selected' : ''}>Target...</option>
                    ${optionsHtml}
                </select>
            `;
        }

        li.innerHTML = `
            <div class="file-info">
                <img src="${previewSrc}" alt="preview" class="file-preview">
                <div class="file-details">
                    <h4>${fileObj.file.name}</h4>
                    <p>${fileSize} • ${fileObj.file.type || 'Unknown'}</p>
                </div>
            </div>
            <div class="file-actions">
                ${actionContent}
                <button class="remove-btn" onclick="removeFile('${fileObj.id}')" title="Remove">✕</button>
            </div>
        `;
        fileList.appendChild(li);

        // Revoke object URL to avoid memory leaks (if image)
        // Note: doing this immediately might break preview if image hasn't loaded. 
        // Better to do it on remove or when list clears. 
        // For this simple app, we might let the browser handle it or clear on clearAll.
    });

    // Re-attach global functions
    window.removeFile = removeFile;
    window.updateFileFormat = updateFileFormat;
    window.downloadFile = downloadFile;
}

function removeFile(id) {
    files = files.filter(f => f.id !== id);
    renderFileList();
    updateUIState();
    updateGlobalFormatOptions();
}

function updateFileFormat(id, format) {
    const file = files.find(f => f.id === id);
    if (file) {
        file.targetFormat = format;
        updateUIState();
    }
}

function updateAllFormats() {
    const format = globalFormatSelect.value;
    if (!format) return;

    files.forEach(f => {
        if (f.status === 'pending') {
            // Only update if this file SUPPORTS this format
            const compatible = getCompatibleFormats(f.file);
            const supports = compatible.some(opt => opt.value === format);
            if (supports) {
                f.targetFormat = format;
            }
        }
    });
    renderFileList();
    updateUIState();
}

function clearAllFiles() {
    files = [];
    renderFileList();
    updateUIState();
    updateGlobalFormatOptions();
}

async function convertAllFiles() {
    // Only convert pending files that have a target format
    const jobs = files.filter(f => f.status === 'pending' && f.targetFormat);
    if (jobs.length === 0) return;

    jobs.forEach(f => f.status = 'converting');
    renderFileList();
    updateUIState();

    // Process parallel or sequential? Parallel is fine for JS
    await Promise.all(jobs.map(async (fileObj) => {
        try {
            const blob = await convertFile(fileObj.file, fileObj.targetFormat);
            fileObj.resultBlob = blob;
            fileObj.status = 'done';
        } catch (error) {
            console.error(error);
            fileObj.status = 'error';
        }
    }));

    renderFileList();
    updateUIState();
}

function downloadFile(id) {
    const fileObj = files.find(f => f.id === id);
    if (fileObj && fileObj.resultBlob) {
        // Determine extension
        const extMap = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/webp': 'webp',
            'image/bmp': 'bmp',
            'image/gif': 'gif',
            'application/pdf': 'pdf',
            'text/html': 'html',
            'text/csv': 'csv',
            'text/plain': 'txt',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx'
        };
        const ext = extMap[fileObj.targetFormat] || 'bin';
        const originalName = fileObj.file.name.replace(/\.[^/.]+$/, "");
        saveAs(fileObj.resultBlob, `${originalName}_converted.${ext}`);
    }
}
