const reportsList = document.querySelector('#reports-list');
const reportsStatus = document.querySelector('#reports-status');
const reportFormSection = document.querySelector('#report-form-section');
const reportForm = document.querySelector('#report-form');
const reportFormStatus = document.querySelector('#report-form-status');
const evidenceInput = document.querySelector('#report-evidence');
const evidenceSelectionStatus = document.querySelector('#report-evidence-selection');
const evidenceSelectionList = document.querySelector('#report-evidence-list');
const channelId = new URLSearchParams(location.search).get('channelId');
let selectedEvidenceFiles = [];

function renderEvidenceSelection() {
  evidenceSelectionStatus.textContent = selectedEvidenceFiles.length
    ? `${selectedEvidenceFiles.length} of 5 images selected.`
    : 'No images selected.';
  evidenceSelectionList.replaceChildren(...selectedEvidenceFiles.map((file, index) => {
    const item = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = file.name;
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.textContent = 'Remove';
    removeButton.setAttribute('aria-label', `Remove ${file.name}`);
    removeButton.addEventListener('click', () => {
      selectedEvidenceFiles.splice(index, 1);
      renderEvidenceSelection();
    });
    item.append(name, removeButton);
    return item;
  }));
}

evidenceInput.addEventListener('change', () => {
  const incomingFiles = Array.from(evidenceInput.files);
  const remainingSlots = 5 - selectedEvidenceFiles.length;
  selectedEvidenceFiles.push(...incomingFiles.slice(0, remainingSlots));
  evidenceInput.value = '';
  renderEvidenceSelection();

  if (incomingFiles.length > remainingSlots) {
    evidenceSelectionStatus.textContent = 'Only 5 images can be attached to one report.';
  }
});

async function loadUser() {
  const response = await fetch('/api/users/me');
  if (!response.ok) { location.href = '/login'; return false; }
  const user = await response.json();
  document.querySelector('#welcome').textContent = `Welcome, ${user.email}`;
  return true;
}

function formatReason(reason) {
  return reason.toLowerCase().split('_').map((word) => `${word[0].toUpperCase()}${word.slice(1)}`).join(' ');
}

function createReasonSelect(value) {
  const select = document.createElement('select');
  select.name = 'reason';
  select.required = true;

  for (const [reason, label] of [
    ['STREAM_DOES_NOT_LOAD', 'Stream does not load'],
    ['WRONG_CHANNEL', 'Wrong channel'],
    ['AUDIO_PROBLEM', 'Audio problem'],
    ['VIDEO_PROBLEM', 'Video problem'],
    ['OTHER', 'Other']
  ]) {
    const option = document.createElement('option');
    option.value = reason;
    option.textContent = label;
    option.selected = reason === value;
    select.append(option);
  }

  return select;
}

async function submitReportUpdate(event, report, form, statusMessage) {
  event.preventDefault();
  const formData = new FormData(form);
  statusMessage.textContent = 'Saving changes…';

  const response = await fetch(`/api/reports/${report._id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      reason: formData.get('reason'),
      description: formData.get('description'),
      status: formData.get('status')
    })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    statusMessage.textContent = payload.error?.message || 'Could not update the report.';
    return;
  }

  await loadReports();
}

async function deleteReport(report, button, statusMessage) {
  if (!window.confirm('Are you sure you want to delete this report?')) return;

  button.disabled = true;
  statusMessage.textContent = 'Deleting report…';
  const response = await fetch(`/api/reports/${report._id}`, {
    method: 'DELETE'
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    statusMessage.textContent = payload.error?.message || 'Could not delete the report.';
    button.disabled = false;
    return;
  }

  await loadReports();
}

function createReportItem(report) {
  const item = document.createElement('article');
  item.className = 'report-item';
  const channel = document.createElement('h3');
  channel.textContent = report.channelId?.name || 'Channel unavailable';
  const reason = document.createElement('p');
  reason.textContent = `Reason: ${formatReason(report.reason)}`;
  const description = document.createElement('p');
  description.textContent = report.description;
  const status = document.createElement('p');
  status.className = 'report-status';
  status.textContent = report.status;
  const created = document.createElement('p');
  created.className = 'report-date';
  created.textContent = new Date(report.createdAt).toLocaleString();
  item.append(channel, reason, description, status, created);
  const evidenceUrls = Array.isArray(report.evidenceUrls)
    ? report.evidenceUrls
    : report.evidenceUrl
      ? [report.evidenceUrl]
      : [];
  if (evidenceUrls.length > 0) {
    const evidenceLinks = document.createElement('div');
    evidenceLinks.className = 'report-evidence';
    evidenceUrls.forEach((url) => {
      if (typeof url !== 'string') return;
      const evidence = document.createElement('a');
      evidence.href = url;
      evidence.textContent = url;
      evidence.setAttribute('aria-expanded', 'false');
      const preview = document.createElement('img');
      preview.alt = 'Report evidence';
      preview.style.display = 'none';
      const previewError = document.createElement('p');
      previewError.className = 'form-status';
      previewError.hidden = true;
      previewError.textContent = 'Could not load this image.';
      let imageRequested = false;
      let imageFailed = false;
      preview.addEventListener('error', () => {
        imageFailed = true;
        preview.style.display = 'none';
        previewError.hidden = false;
        evidence.setAttribute('aria-expanded', 'false');
      });
      evidence.addEventListener('click', (event) => {
        event.preventDefault();
        if (preview.style.display !== 'none') {
          preview.style.display = 'none';
          evidence.setAttribute('aria-expanded', 'false');
          return;
        }

        if (imageFailed) {
          previewError.hidden = false;
          return;
        }

        previewError.hidden = true;
        preview.style.display = 'block';
        evidence.setAttribute('aria-expanded', 'true');
        if (!imageRequested) {
          imageRequested = true;
          preview.src = url;
        }
      });
      evidenceLinks.append(evidence);
      evidenceLinks.append(preview, previewError);
    });
    item.append(evidenceLinks);
  }

  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.textContent = 'Edit report';
  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.textContent = 'Delete report';
  const deleteStatus = document.createElement('p');
  deleteStatus.className = 'form-status';
  deleteStatus.setAttribute('aria-live', 'polite');
  deleteButton.addEventListener('click', () => {
    deleteReport(report, deleteButton, deleteStatus);
  });

  const editForm = document.createElement('form');
  editForm.className = 'report-panel';
  editForm.hidden = true;

  const editHeading = document.createElement('h2');
  editHeading.textContent = 'Edit report';
  const reasonLabel = document.createElement('label');
  reasonLabel.textContent = 'Reason';
  reasonLabel.append(createReasonSelect(report.reason));
  const descriptionLabel = document.createElement('label');
  descriptionLabel.textContent = 'Description';
  const descriptionInput = document.createElement('textarea');
  descriptionInput.name = 'description';
  descriptionInput.maxLength = 1000;
  descriptionInput.required = true;
  descriptionInput.value = report.description;
  descriptionLabel.append(descriptionInput);
  const statusLabel = document.createElement('label');
  statusLabel.textContent = 'Status';
  const statusSelect = document.createElement('select');
  statusSelect.name = 'status';
  const openStatus = document.createElement('option');
  openStatus.value = 'OPEN';
  openStatus.textContent = 'Open';
  openStatus.selected = report.status === 'OPEN';
  statusSelect.append(openStatus);
  statusLabel.append(statusSelect);
  const saveButton = document.createElement('button');
  saveButton.type = 'submit';
  saveButton.textContent = 'Save changes';
  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.textContent = 'Cancel';
  const statusMessage = document.createElement('p');
  statusMessage.className = 'form-status';
  statusMessage.setAttribute('aria-live', 'polite');

  editForm.append(editHeading, reasonLabel, descriptionLabel, statusLabel, saveButton, cancelButton, statusMessage);
  editButton.addEventListener('click', () => {
    editForm.hidden = false;
    editButton.hidden = true;
  });
  cancelButton.addEventListener('click', () => {
    editForm.hidden = true;
    editButton.hidden = false;
    statusMessage.textContent = '';
  });
  editForm.addEventListener('submit', (event) => {
    submitReportUpdate(event, report, editForm, statusMessage);
  });
  item.append(editButton, deleteButton, deleteStatus, editForm);

  return item;
}

async function loadReports() {
  const response = await fetch('/api/reports');
  if (!response.ok) { reportsStatus.textContent = 'Could not load reports.'; return; }
  const { reports } = await response.json();
  reportsStatus.textContent = `${reports.length} report${reports.length === 1 ? '' : 's'}`;
  if (reports.length === 0) {
    reportsList.replaceChildren(Object.assign(document.createElement('p'), { className: 'empty-state', textContent: 'You have not reported a channel yet.' }));
    return;
  }
  reportsList.replaceChildren(...reports.map(createReportItem));
}

async function submitReport(event) {
  event.preventDefault();
  const formData = new FormData();
  formData.append('channelId', channelId);
  formData.append('reason', document.querySelector('#report-reason').value);
  formData.append('description', document.querySelector('#report-description').value);

  for (const file of selectedEvidenceFiles) {
    formData.append('evidence', file);
  }

  reportFormStatus.textContent = 'Submitting report…';
  const response = await fetch('/api/reports', {
    method: 'POST',
    body: formData
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    reportFormStatus.textContent = payload.error?.message || 'Could not submit the report.';
    return;
  }

  reportForm.reset();
  selectedEvidenceFiles = [];
  renderEvidenceSelection();
  reportFormStatus.textContent = 'Report saved.';
  await loadReports();
}

function configureReportForm() {
  if (!channelId) return;
  reportFormSection.hidden = false;
  document.querySelector('#report-channel-id').value = channelId;
  document.querySelector('#report-channel').textContent = 'Report the selected channel.';
  reportForm.addEventListener('submit', submitReport);
}

document.querySelector('#logout').addEventListener('click', async () => { await fetch('/api/auth/logout', { method: 'POST' }); location.href = '/login'; });
async function start() { if (await loadUser()) { configureReportForm(); await loadReports(); } }
start();
