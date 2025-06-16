import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    onSnapshot,
    doc,
    updateDoc,
    deleteDoc,
    query,
    where,
    getDocs
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import {
    getStorage,
    ref,
    uploadBytes,
    getDownloadURL,
    deleteObject
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// IMPORTANT: Replace with your Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyDknYH6HDFxaskjKFJYrnn6ulXOtRxYqZs",
    authDomain: "dad-album.firebaseapp.com",
    projectId: "dad-album",
    storageBucket: "dad-album.firebasestorage.app",
    messagingSenderId: "812178689233",
    appId: "1:812178689233:web:d99ad209f6cae79128c9f0",
    measurementId: "G-0SM67KDB6W"
};

// --- Initialize Firebase ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// --- DOM Elements ---
const mainContent = document.getElementById('main-content');
const passwordInput = document.getElementById('password-input');
const passwordSubmit = document.getElementById('password-submit');
const passwordError = document.getElementById('password-error');
const toggleViewBtn = document.getElementById('toggle-view');
const photosView = document.getElementById('photos-view');
const timelineView = document.getElementById('timeline-view');
const addTimelineControls = document.getElementById('add-timeline-controls');
const addAlbumControls = document.getElementById('add-album-controls');
const albumImageUpload = document.getElementById('album-image-upload');
const uploadProgressContainer = document.getElementById('upload-progress-container');
const uploadProgressText = document.getElementById('upload-progress-text');
const albumSelectionGrid = document.getElementById('album-selection-grid');
const timelineEventInput = document.getElementById('timeline-event');
const addTimelinePointBtn = document.getElementById('add-timeline-point');
const chooseTimelineImageBtn = document.getElementById('choose-timeline-image');
const timelineImagePreview = document.getElementById('timeline-image-preview');
const viewerImage = document.getElementById('viewer-image');
const viewerTitle = document.getElementById('viewer-title');
const viewerActions = document.getElementById('viewer-actions');
const favoriteBtn = document.getElementById('favorite-btn');
const deleteBtn = document.getElementById('delete-btn');
const downloadBtn = document.getElementById('download-btn');
const editDateBtn = document.getElementById('edit-date-btn');
const favoritesToggleBtn = document.getElementById('favorites-toggle-btn');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
const gotoDateInput = document.getElementById('goto-date-input');
const gotoDateBtn = document.getElementById('goto-date-btn');
const albumFilterDate = document.getElementById('album-filter-date');
const albumFilterBtn = document.getElementById('album-filter-btn');
const albumFilterResetBtn = document.getElementById('album-filter-reset-btn');
const newPhotoDateInput = document.getElementById('new-photo-date');
const saveDateBtn = document.getElementById('save-date-btn');
const toastElement = document.getElementById('app-toast');
const toast = new bootstrap.Toast(toastElement);

// --- Modals ---
const passwordModal = new bootstrap.Modal(document.getElementById('passwordModal'));
const albumSelectModal = new bootstrap.Modal(document.getElementById('albumSelectModal'));
const viewerModal = new bootstrap.Modal(document.getElementById('viewerModal'));
const deleteConfirmModal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));
const editDateModal = new bootstrap.Modal(document.getElementById('editDateModal'));

// --- State ---
let isTimelineView = false;
let favoritesOnly = false;
let selectedTimelinePhoto = null;
let currentPhotoId = null;
let photoToDeleteId = null;
let allPhotos = [];
let timelinePoints = [];
const correctPassword = 'bon101709';

// --- Toast Notification Function ---
function showToast(title, body) {
    document.getElementById('toast-title').textContent = title;
    document.getElementById('toast-body').textContent = body;
    toast.show();
}

// --- Initial Load & Password ---
window.addEventListener('DOMContentLoaded', () => {
    passwordModal.show();
});
passwordSubmit.addEventListener('click', () => {
    if (passwordInput.value === correctPassword) {
        passwordModal.hide();
        mainContent.classList.remove('d-none');
    } else {
        passwordError.classList.remove('d-none');
    }
});

// --- Date Extraction Logic ---
function getExifDate(file) {
    return new Promise((resolve) => {
        EXIF.getData(file, function () {
            const dateTime = EXIF.getTag(this, "DateTimeOriginal") || EXIF.getTag(this, "DateTime");
            if (dateTime) {
                const parts = dateTime.split(' ');
                const dateParts = parts[0].split(':');
                const isoDateTime = `${dateParts[0]}-${dateParts[1]}-${dateParts[2]}T${parts[1]}`;
                resolve(new Date(isoDateTime));
            } else {
                resolve(new Date(file.lastModified));
            }
        });
    });
}

// --- Generic Uploader ---
async function handleFileUpload(files, dateExtractor) {
    if (!files.length) return;
    uploadProgressContainer.classList.remove('d-none');
    uploadProgressText.textContent = `(0 / ${files.length})`;
    let uploadedCount = 0;
    for (const file of files) {
        try {
            const photoTakenAt = await dateExtractor(file);
            const storageRef = ref(storage, `album/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            const imageUrl = await getDownloadURL(storageRef);
            await addDoc(collection(db, "albumImages"), {
                url: imageUrl,
                storagePath: storageRef.fullPath,
                photoTakenAt,
                uploadedAt: new Date(),
                isFavorite: false,
            });
        } catch (error) {
            console.error("Failed to process file:", file.name, error);
        }
        uploadedCount++;
        uploadProgressText.textContent = `(${uploadedCount} / ${files.length})`;
    }
    setTimeout(() => uploadProgressContainer.classList.add('d-none'), 2000);
    albumImageUpload.value = '';
}
albumImageUpload.addEventListener('change', (e) => handleFileUpload(e.target.files, getExifDate));


// --- Photos App Logic ---
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function renderPhotos() {
    const photosToRender = favoritesOnly ? allPhotos.filter(p => p.isFavorite) : allPhotos;
    photosView.innerHTML = '';

    if (photosToRender.length === 0) {
        photosView.innerHTML = `<p class="text-center text-muted mt-5">No photos to display.</p>`;
        return;
    }

    let currentYear = -1,
        currentMonth = -1,
        monthGrid;
    photosToRender.forEach(photo => {
        const photoDate = photo.photoTakenAt.toDate();
        const year = photoDate.getFullYear(),
            month = photoDate.getMonth();
        const monthId = `date-${year}-${String(month).padStart(2, '0')}`;
        if (year !== currentYear) {
            currentYear = year;
            photosView.insertAdjacentHTML('beforeend', `<div id="date-${year}" class="date-header mt-4"><h2>${currentYear}</h2></div>`);
            currentMonth = -1;
        }
        if (month !== currentMonth) {
            currentMonth = month;
            photosView.insertAdjacentHTML('beforeend', `<div id="${monthId}" class="date-header"><h3>${monthNames[currentMonth]}</h3></div>`);
            const gridContainer = document.createElement('div');
            gridContainer.className = 'row row-cols-2 row-cols-sm-3 row-cols-md-5 g-4 mb-4 photo-grid';
            photosView.appendChild(gridContainer);
            monthGrid = gridContainer;
        }
        const col = document.createElement('div');
        col.className = 'col photo-item';
        col.innerHTML = `<img src="${photo.url}" data-id="${photo.id}" alt="Album photo">`;
        col.firstElementChild.addEventListener('click', () => openPhotoViewer(photo.id));
        monthGrid.appendChild(col);
    });
}

// --- Album Selection Modal Logic ---
function populateAlbumSelectionGrid(photos) {
    albumSelectionGrid.innerHTML = '';
    if (photos.length === 0) {
        albumSelectionGrid.innerHTML = `<p class="text-center text-muted col-12">No photos match the filter.</p>`;
        return;
    }
    photos.forEach(imgData => {
        const selectCol = document.createElement('div');
        selectCol.className = 'col';
        selectCol.innerHTML = `<img src="${imgData.url}" class="img-fluid rounded border p-1" style="cursor: pointer; aspect-ratio: 1/1; object-fit: cover;">`;
        selectCol.firstElementChild.addEventListener('click', () => {
            selectedTimelinePhoto = imgData;
            timelineImagePreview.src = imgData.url;
            timelineImagePreview.style.display = 'block';
            albumSelectModal.hide();
        });
        albumSelectionGrid.appendChild(selectCol);
    });
}

albumFilterBtn.addEventListener('click', () => {
    const [year, month] = albumFilterDate.value.split('-').map(Number);
    if (!year || !month) return;
    const filteredPhotos = allPhotos.filter(p => {
        const d = p.photoTakenAt.toDate();
        return d.getFullYear() === year && d.getMonth() === month - 1;
    });
    populateAlbumSelectionGrid(filteredPhotos);
});

albumFilterResetBtn.addEventListener('click', () => {
    populateAlbumSelectionGrid(allPhotos);
    albumFilterDate.value = '';
});

onSnapshot(collection(db, "albumImages"), (snapshot) => {
    allPhotos = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));
    allPhotos.sort((a, b) => b.photoTakenAt.toDate() - a.photoTakenAt.toDate());
    renderPhotos();
    populateAlbumSelectionGrid(allPhotos);
});

// --- Main Viewer & Actions Logic ---
function openPhotoViewer(photoId) {
    const photo = allPhotos.find(p => p.id === photoId);
    if (!photo) return;
    currentPhotoId = photoId;
    viewerImage.src = photo.url;
    viewerImage.classList.remove('d-none');
    viewerTitle.textContent = photo.photoTakenAt.toDate().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    viewerActions.classList.remove('d-none');
    favoriteBtn.classList.toggle('is-favorite', photo.isFavorite);
    viewerModal.show();
}
favoriteBtn.addEventListener('click', async () => {
    if (!currentPhotoId) return;
    const photo = allPhotos.find(p => p.id === currentPhotoId);
    await updateDoc(doc(db, "albumImages", currentPhotoId), {
        isFavorite: !photo.isFavorite
    });
});

downloadBtn.addEventListener('click', () => {
    const photo = allPhotos.find(p => p.id === currentPhotoId);
    if (!photo) return;

    // Create a temporary anchor element
    const a = document.createElement('a');
    a.style.display = 'none';

    // Set the href to the direct image URL from Firebase
    a.href = photo.url;

    // The 'download' attribute tells the browser to download the file instead of navigating to it.
    const date = photo.photoTakenAt.toDate();
    a.download = `Photo_${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}.jpg`;

    document.body.appendChild(a);
    a.click(); // Programmatically click the link to trigger the download
    document.body.removeChild(a); // Clean up the element
});

editDateBtn.addEventListener('click', () => {
    const photo = allPhotos.find(p => p.id === currentPhotoId);
    if (!photo) return;
    const date = photo.photoTakenAt.toDate();
    newPhotoDateInput.value = date.toISOString().split('T')[0];
    editDateModal.show();
});

saveDateBtn.addEventListener('click', async () => {
    if (!currentPhotoId || !newPhotoDateInput.value) return;
    const newDate = new Date(newPhotoDateInput.value);
    const docRef = doc(db, "albumImages", currentPhotoId);
    try {
        await updateDoc(docRef, {
            photoTakenAt: newDate
        });
        showToast("Success", "Photo date has been updated.");
    } catch (e) {
        showToast("Error", "Could not update the date.");
    } finally {
        editDateModal.hide();
        viewerModal.hide();
    }
});

// Cascading delete
confirmDeleteBtn.addEventListener('click', async () => {
    if (!photoToDeleteId) return;
    const photo = allPhotos.find(p => p.id === photoToDeleteId);
    try {
        const q = query(collection(db, "timelinePoints"), where("imageUrl", "==", photo.url));
        const querySnapshot = await getDocs(q);
        querySnapshot.forEach(async (doc) => {
            await deleteDoc(doc.ref);
        });
        await deleteDoc(doc(db, "albumImages", photoToDeleteId));
        if (photo.storagePath) {
            await deleteObject(ref(storage, photo.storagePath));
        }
        showToast("Success", "Photo and any linked timeline events were deleted.");
    } catch (error) {
        console.error("Error deleting photo: ", error);
        showToast("Error", "Could not delete photo.");
    } finally {
        photoToDeleteId = null;
        deleteConfirmModal.hide();
        viewerModal.hide();
    }
});


// ==========================================================
// --- TIMELINE LOGIC (REWORKED) ---
// ==========================================================
const timelineContainer = document.getElementById('timeline');
const timelineMargin = {
    top: 20,
    right: 30,
    bottom: 40,
    left: 50
};
let timelineWidth, timelineHeight, timelineCurrentZoomState;
const timelineSvg = d3.select("#timeline").append("svg").attr("class", "timeline-svg").append("g").attr("transform", `translate(${timelineMargin.left},${timelineMargin.top})`);
const timelineGX = timelineSvg.append("g").attr("class", "axis axis--x");
const timelineX = d3.scaleTime();
const timelineXAxis = d3.axisBottom(timelineX).tickFormat(d3.timeFormat("%b %Y"));
const timelineZoom = d3.zoom().scaleExtent([0.5, 20]).on("zoom", (event) => {
    if (!timelineWidth) return;
    timelineCurrentZoomState = event.transform;
    const newX = timelineCurrentZoomState.rescaleX(timelineX);
    timelineGX.call(timelineXAxis.scale(newX));
    timelineSvg.selectAll(".timeline-group").attr("transform", d => `translate(${newX(new Date(d.date))}, 0)`);
});
d3.select(".timeline-svg").call(timelineZoom);

function refreshTimelineLayout() {
    if (timelineView.classList.contains('d-none')) return;
    timelineWidth = timelineContainer.clientWidth - timelineMargin.left - timelineMargin.right;
    timelineHeight = timelineContainer.clientHeight - timelineMargin.top - timelineMargin.bottom;
    d3.select('.timeline-svg').attr('viewBox', `0 0 ${timelineWidth + timelineMargin.left + timelineMargin.right} ${timelineHeight + timelineMargin.top + timelineMargin.bottom}`);
    timelineX.range([0, timelineWidth]);
    timelineGX.attr("transform", `translate(0,${timelineHeight})`);
    timelineZoom.extent([
        [0, 0],
        [timelineWidth, timelineHeight]
    ]).translateExtent([
        [0, 0],
        [timelineWidth, timelineHeight]
    ]);
    updateTimelineData(timelinePoints);
}

function updateTimelineData(data) {
    if (!timelineWidth) return;
    if (!data.length) {
        timelineSvg.selectAll(".timeline-group").remove();
        timelineGX.call(timelineXAxis.scale(timelineX.domain([new Date(), new Date()])));
        return;
    }

    timelineX.domain(d3.extent(data, d => new Date(d.date)));
    const currentXScale = timelineCurrentZoomState ? timelineCurrentZoomState.rescaleX(timelineX) : timelineX;
    timelineGX.call(timelineXAxis.scale(currentXScale));

    const groups = timelineSvg.selectAll(".timeline-group").data(data, d => d.id);
    groups.exit().remove();
    const enterGroups = groups.enter().append("g").attr("class", "timeline-group").on("click", (event, d) => showTimelineEventViewer(d));
    enterGroups.append("image")
        .attr("href", d => d.imageUrl)
        .attr("y", (d, i) => timelineHeight / 2 + (i % 2 === 0 ? -70 : 30))
        .attr("x", -25).attr("width", 50).attr("height", 50)
        .style("display", d => d.imageUrl ? "block" : "none");
    enterGroups.append("circle").attr("class", "timeline-point").attr("cy", timelineHeight / 2).attr("r", 8);
    enterGroups.append("text").attr("class", "timeline-label").attr("y", (d, i) => timelineHeight / 2 + (i % 2 === 0 ? 25 : -15)).text(d => d.event);
    enterGroups.merge(groups).attr("transform", d => `translate(${currentXScale(new Date(d.date))}, 0)`);
}

function showTimelineEventViewer(d) {
    viewerActions.classList.add('d-none');
    const formattedDate = new Date(d.date).toLocaleDateString('en-us', {
        year: "numeric",
        month: "long",
        day: "numeric"
    });
    viewerTitle.textContent = `${d.event} on ${formattedDate}`;

    if (d.imageUrl) {
        viewerImage.src = d.imageUrl;
        viewerImage.classList.remove('d-none');
    } else {
        viewerImage.src = '';
        viewerImage.classList.add('d-none');
    }
    viewerModal.show();
}

toggleViewBtn.addEventListener('click', () => {
    isTimelineView = !isTimelineView;
    photosView.classList.toggle('d-none');
    timelineView.classList.toggle('d-none');
    addAlbumControls.classList.toggle('d-none');
    addTimelineControls.classList.toggle('d-none');
    toggleViewBtn.textContent = isTimelineView ? 'Back to Photos' : 'Our Timeline';

    if (isTimelineView) {
        setTimeout(refreshTimelineLayout, 50);
    }
});

chooseTimelineImageBtn.addEventListener('click', () => {
    albumSelectModal.show();
});

addTimelinePointBtn.addEventListener('click', async () => {
    const eventText = timelineEventInput.value;
    if (!eventText || !selectedTimelinePhoto) {
        return showToast("Missing Info", "Please provide a description and choose a photo.");
    }
    const date = selectedTimelinePhoto.photoTakenAt.toDate();

    await addDoc(collection(db, "timelinePoints"), {
        date,
        event: eventText,
        imageUrl: selectedTimelinePhoto.url,
        createdAt: new Date()
    });
    showToast("Success", "Timeline point added!");
    timelineEventInput.value = '';
    timelineImagePreview.src = '';
    timelineImagePreview.style.display = 'none';
    selectedTimelinePhoto = null;
});

onSnapshot(collection(db, "timelinePoints"), (snapshot) => {
    timelinePoints = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));
    timelinePoints.sort((a, b) => new Date(a.date) - new Date(b.date));
    updateTimelineData(timelinePoints);
});

window.addEventListener('resize', refreshTimelineLayout);