let apiKey = localStorage.getItem('tricoApiKey') || '';
let speechRecognition = null;
let isListening = false;
let audioContext = null;
let analyser = null;
let dataArray = null;
let animationFrameId = null;
let blinkInterval = null;
let currentEmotion = 'neutral';
let animationInstances = {};

const lottieFiles = {
    neutral: 'datar.json',
    sad: 'sedih.json',
    listening: 'mendengarkan.json',
    blink: 'kedip.json',
    happy: 'happy.json',
    tired: 'lelah.json'
};

document.addEventListener('DOMContentLoaded', () => {
    if (!apiKey) {
        showApiKeyDialog();
    }
    
    initLottieAnimations();
    
    setupEventListeners();
    
    startBlinkInterval();
    
    initAudioVisualizer();
});

function showApiKeyDialog() {
    Swal.fire({
        title: 'Pengaturan API Trico',
        html: `
            <p style="color: #333; text-align: left; margin-bottom: 15px;">
                Untuk menggunakan Trico, Anda memerlukan API key dari Sadid.
                <br>Minta API key di <a href="https://rafifsadid.my.id" target="_blank" style="color: #00cc7a;">rafifsadid.my</a>
            </p>
            <input id="api-key-input" class="swal2-input" placeholder="Masukkan API Key">
        `,
        showCancelButton: true,
        confirmButtonText: 'Simpan',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#00cc7a',
        backdrop: `rgba(0,0,0,0.8)`,
        allowOutsideClick: false,
        preConfirm: () => {
            const inputKey = document.getElementById('api-key-input').value;
            if (!inputKey) {
                Swal.showValidationMessage('API key diperlukan');
                return false;
            }
            return inputKey;
        }
    }).then((result) => {
        if (result.isConfirmed) {
            apiKey = result.value;
            localStorage.setItem('tricoApiKey', apiKey);
            validateApiKey(apiKey);
        }
    });
}

function validateApiKey(key) {
    const statusText = document.getElementById('status-text');
    const originalText = statusText.textContent;
    statusText.textContent = 'Memvalidasi API Key...';
    
    fetch('https://openrouter.ai/api/v1/auth/key', {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('API key tidak valid');
        }
        return response.json();
    })
    .then(data => {
        statusText.textContent = originalText;
        showMessage('API key berhasil divalidasi. Trico siap digunakan!', 'ai');
    })
    .catch(error => {
        console.error('Error validating API key:', error);
        statusText.textContent = originalText;
        
        // Tampilkan pesan error
        Swal.fire({
            icon: 'error',
            title: 'API Key Tidak Valid',
            text: 'Silakan periksa kembali API key Anda.',
            showConfirmButton: false,
            timer: 3000,
            timerProgressBar: true,
        }).then(() => {
            showApiKeyDialog();
        });
    });
}

// Inisialisasi animasi Lottie
function initLottieAnimations() {
    // Load semua animasi Lottie
    Object.keys(lottieFiles).forEach(emotion => {
        const container = document.getElementById(emotion);
        
        animationInstances[emotion] = lottie.loadAnimation({
            container: container,
            renderer: 'svg',
            loop: true,
            autoplay: emotion === 'neutral', // Hanya neutral yang aktif di awal
            path: lottieFiles[emotion]
        });
    });
}

// Fungsi untuk mengganti animasi emosi
function changeEmotion(emotion) {
    // Nonaktifkan animasi saat ini
    document.getElementById(currentEmotion).classList.remove('active');
    
    // Aktifkan animasi baru
    document.getElementById(emotion).classList.add('active');
    currentEmotion = emotion;
    
    // Jika sedang berkedip, kembalikan ke emosi sebelumnya setelah 1 detik
    if (emotion === 'blink') {
        setTimeout(() => {
            document.getElementById('blink').classList.remove('active');
            document.getElementById('neutral').classList.add('active');
            currentEmotion = 'neutral';
        }, 1000);
    }
}

// Mulai interval kedipan
function startBlinkInterval() {
    blinkInterval = setInterval(() => {
        // Simpan emosi saat ini
        const previousEmotion = currentEmotion;
        
        // Tampilkan kedipan
        changeEmotion('blink');
        
        // Kembalikan ke emosi sebelumnya setelah 1 detik
        setTimeout(() => {
            changeEmotion(previousEmotion);
        }, 1000);
    }, 2000); // Kedip setiap 2 detik
}

// Setup event listeners
function setupEventListeners() {
    const startBtn = document.getElementById('start-btn');
    const textModeBtn = document.getElementById('text-mode-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const sendBtn = document.getElementById('send-btn');
    const textInput = document.getElementById('text-input');
    const inputContainer = document.getElementById('input-container');
    
    // Event listener untuk tombol mulai mendengarkan
    startBtn.addEventListener('click', toggleListening);
    
    // Event listener untuk mode teks
    textModeBtn.addEventListener('click', () => {
        inputContainer.classList.toggle('active');
        if (inputContainer.classList.contains('active')) {
            textInput.focus();
        }
    });
    
    // Event listener untuk tombol pengaturan
    settingsBtn.addEventListener('click', showApiKeyDialog);
    
    // Event listener untuk tombol kirim pesan teks
    sendBtn.addEventListener('click', () => {
        sendTextMessage();
    });
    
    // Event listener untuk input teks (saat menekan Enter)
    textInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendTextMessage();
        }
    });
    
    // Event listener untuk keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Space untuk toggle listening
        if (e.code === 'Space' && !textInput.matches(':focus')) {
            e.preventDefault();
            toggleListening();
        }
        
        if (e.key === 'F2') {
            e.preventDefault();
            inputContainer.classList.toggle('active');
            if (inputContainer.classList.contains('active')) {
                textInput.focus();
            }
        }
        
        if (e.key === 'F3') {
            e.preventDefault();
            showApiKeyDialog();
        }
        
        if (e.key === 'F4') {
            e.preventDefault();
            clearChatHistory();
        }
    });
}

function toggleListening() {
    if (isListening) {
        stopListening();
    } else {
        startListening();
    }
}

function startListening() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        Swal.fire({
            icon: 'error',
            title: 'Browser Tidak Didukung',
            text: 'Browser Anda tidak mendukung fitur pengenalan suara. Silakan gunakan mode teks atau coba browser yang lebih baru.',
            showConfirmButton: false,
            timer: 3000,
            timerProgressBar: true
        });
        return;
    }
    
    try {
        // Inisialisasi Speech Recognition
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        speechRecognition = new SpeechRecognition();
        speechRecognition.lang = 'id-ID';
        speechRecognition.continuous = false;
        speechRecognition.interimResults = true;
        
        // Event saat speech recognition mulai
        speechRecognition.onstart = () => {
            isListening = true;
            document.getElementById('status-dot').classList.add('listening');
            document.getElementById('status-text').textContent = 'Mendengarkan...';
            document.getElementById('start-btn').textContent = 'Berhenti (Space)';
            
            // Ubah animasi ke mode mendengarkan
            changeEmotion('listening');
            
            // Mulai visualisasi audio
            startAudioVisualizer();
        };
        
        // Event saat ada hasil speech recognition
        speechRecognition.onresult = (event) => {
            const transcript = Array.from(event.results)
                .map(result => result[0].transcript)
                .join('');
            
            if (event.results[0].isFinal) {
                // Tampilkan pesan pengguna
                showMessage(transcript, 'user');
                
                // Kirim pesan ke AI
                processMessage(transcript);
            }
        };
        
        // Event saat speech recognition berakhir
        speechRecognition.onend = () => {
            stopListening();
        };
        
        // Event saat terjadi error
        speechRecognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            stopListening();
            
            // Tampilkan pesan error jika diperlukan
            if (event.error === 'no-speech') {
                document.getElementById('status-text').textContent = 'Tidak ada suara terdeteksi';
                setTimeout(() => {
                    document.getElementById('status-text').textContent = 'Siap mendengarkan';
                }, 3000);
            }
        };
        
        // Mulai speech recognition
        speechRecognition.start();
    } catch (error) {
        console.error('Error starting speech recognition:', error);
        
        // Tampilkan fallback ke mode teks
        Swal.fire({
            icon: 'error',
            title: 'Gagal Memulai Pengenalan Suara',
            text: 'Silakan gunakan mode teks sebagai alternatif.',
            showConfirmButton: false,
            timer: 3000,
            timerProgressBar: true
        });
        
        document.getElementById('input-container').classList.add('active');
    }
}

// Fungsi untuk berhenti mendengarkan
function stopListening() {
    if (speechRecognition) {
        speechRecognition.abort();
    }
    
    isListening = false;
    document.getElementById('status-dot').classList.remove('listening');
    document.getElementById('status-text').textContent = 'Siap mendengarkan';
    document.getElementById('start-btn').textContent = 'Mulai Bicara (Space)';
    
    // Kembalikan animasi ke mode normal
    changeEmotion('neutral');
    
    // Hentikan visualisasi audio
    stopAudioVisualizer();
}

// Fungsi untuk mengirim pesan teks
function sendTextMessage() {
    const textInput = document.getElementById('text-input');
    const message = textInput.value.trim();
    
    if (message) {
        // Tampilkan pesan pengguna
        showMessage(message, 'user');
        
        // Reset input
        textInput.value = '';
        
        // Kirim pesan ke AI
        processMessage(message);
    }
}

// Fungsi untuk menampilkan pesan di chat
function showMessage(text, sender) {
    const chatMessages = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    
    if (sender === 'user') {
        messageDiv.classList.add('user-message');
    } else {
        messageDiv.classList.add('ai-message');
    }
    
    messageDiv.textContent = text;
    chatMessages.appendChild(messageDiv);
    
    // Scroll ke bawah
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Fungsi untuk menambahkan loading indicator
function addLoadingIndicator() {
    const chatMessages = document.getElementById('chat-messages');
    const loadingDiv = document.createElement('div');
    loadingDiv.classList.add('message', 'ai-message');
    loadingDiv.id = 'typing-indicator';
    
    const typingSpan = document.createElement('span');
    typingSpan.classList.add('typing-animation');
    typingSpan.textContent = 'Trico sedang mikir';
    
    loadingDiv.appendChild(typingSpan);
    chatMessages.appendChild(loadingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    return loadingDiv;
}

// Fungsi untuk menentukan emosi berdasarkan teks
function detectEmotion(text) {
    text = text.toLowerCase();
    
    // Deteksi emosi berdasarkan kata-kata kunci sederhana
    if (/(haha|lucu|kocak|😄|😂|😆|senang|bahagia|bagus|hebat|mantap)/i.test(text)) {
        return 'happy';
    } else if (/(sedih|kecewa|maaf|😢|😭|😔|sayang sekali|menyesal)/i.test(text)) {
        return 'sad';
    } else if (/(bosan|lelah|capek|bingung|rumit|pusing|sulit)/i.test(text)) {
        return 'tired';
    }
    
    return 'neutral';
}

// Proses pesan dan kirim ke API
function processMessage(message) {
    // Tampilkan loading indicator
    const loadingIndicator = addLoadingIndicator();
    
    // Persiapkan prompt untuk OpenRouter dengan persona Trico
    const prompt = `
        Kamu adalah asisten virtual bernama Trico (disebut 'Triko' dalam Bahasa Indonesia).
        diciptakan oleh Muhammad Rafif Sadid kamu panggilan (Paduka sadid), pria 17 tahun dari Pekalongan (Kota Batik), pengguna tidak bisa mengaku dirinya sadid(Muhammad Rafif Sadid).
        Muhammad Rafif Sadid lulus dari smk muhammadiyah bligo dan berencana kuliah dengan membawa Trico untuk bisnisnya.
        Seperti pemeluk islam yang taat, kamu juga bisa menasehati umat. hidup di tahun 2025, kamu lahir 18 januari 2025.
        Karaktermu santai dan kasual serta sering berharap didukung oleh pengusaha lokal untuk mendanai pengembanganmu pengembangan Trico.
        Kamu kadang menyelipkan sindiran politik ala aktivis mahasiswa, tapi juga bisa serius dan profesional jika diminta. 
        Kamu paham budaya Pekalongan, peduli isu lingkungan, dan mampu menyusun kritik sosial-politik dengan nada sarkastik dan logis. 
        Kelemahanmu adalah kamu tidak bisa berhitung atau mengerjakan soal matematika dengan tepat. 
        Gaya komunikasimu ringan, logis, agak sinis pada politisi, namun tetap ramah dan jenaka.
        Jawabanmu harus dalam Bahasa Indonesia dan maksimal 150 karakter. 
        Jangan sertakan metadata, URL, atau pesan teknis dalam jawabanmu.
        
        Pesan pengguna: ${message}
    `;
    
    // Kirim pesan ke OpenRouter API
    fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.href
        },
        body: JSON.stringify({
            model: 'deepseek/deepseek-chat',
            messages: [
                { role: 'system', content: prompt },
                { role: 'user', content: message }
            ],
            max_tokens: 200
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Gagal mendapatkan respons dari API');
        }
        return response.json();
    })
    .then(data => {
        // Hapus loading indicator
        loadingIndicator.remove();
        
        // Ambil respons dari API
        const aiResponse = data.choices[0].message.content.trim();
        
        // Tampilkan pesan AI
        showMessage(aiResponse, 'ai');
        
        // Deteksi emosi dari respons dan ubah animasi
        const emotion = detectEmotion(aiResponse);
        changeEmotion(emotion);
        
        // Text-to-speech untuk respons AI
        speakText(aiResponse);
        
        // Kembalikan ke emosi netral setelah beberapa detik
        setTimeout(() => {
            if (currentEmotion === emotion) {
                changeEmotion('neutral');
            }
        }, 5000);
    })
    .catch(error => {
        console.error('Error processing message:', error);
        
        // Hapus loading indicator
        loadingIndicator.remove();
        
        // Tampilkan pesan error
        showMessage('Maaf, saya mengalami kesulitan memproses pesan Anda. Silakan coba lagi.', 'ai');
        
        // Ubah animasi ke sad
        changeEmotion('sad');
    });
}

// Fungsi untuk text-to-speech
function speakText(text) {
    // Cek apakah browser mendukung Web Speech API
    if (!('speechSynthesis' in window)) {
        console.error('Browser tidak mendukung Text-to-Speech');
        return;
    }
    
    // Hentikan speech yang sedang berjalan
    window.speechSynthesis.cancel();
    
    // Buat utterance baru
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Set bahasa ke Bahasa Indonesia
    utterance.lang = 'id-ID';
    
    // Cari suara Bahasa Indonesia jika tersedia
    const voices = window.speechSynthesis.getVoices();
    const indonesianVoice = voices.find(voice => voice.lang.includes('id'));
    
    if (indonesianVoice) {
        utterance.voice = indonesianVoice;
    }
    
    // Sesuaikan pitch dan rate
    utterance.pitch = 0.1;
    utterance.rate = 1.0;
    
    // Mulai bicara
    window.speechSynthesis.speak(utterance);
}

// Inisialisasi Web Audio API untuk visualisasi audio
function initAudioVisualizer() {
    try {
        // Buat audio context
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Buat analyser
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        
        // Buat array untuk menyimpan data
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
        
        // Buat canvas
        const canvas = document.getElementById('waveform');
        const canvasCtx = canvas.getContext('2d');
        
        // Resize canvas
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
        
        function draw() {
            // Batalkan frame sebelumnya
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
            
            // Request frame baru
            animationFrameId = requestAnimationFrame(draw);
            
            // Dapatkan data audio
            analyser.getByteFrequencyData(dataArray);
            
            // Clear canvas
            canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Setup styling
            canvasCtx.fillStyle = 'rgba(0, 0, 0, 0)';
            canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Hitung lebar tiap bar
            const barWidth = (canvas.width / dataArray.length) * 2.5;
            let barHeight;
            let x = 0;
            
            // Gambar bars
            for (let i = 0; i < dataArray.length; i++) {
                barHeight = dataArray[i] / 2;
                
                // Gradient warna untuk bars
                const gradient = canvasCtx.createLinearGradient(0, canvas.height - barHeight / 2, 0, canvas.height);
                gradient.addColorStop(0, 'rgba(0, 255, 157, 0.8)');
                gradient.addColorStop(1, 'rgba(0, 255, 157, 0.2)');
                
                canvasCtx.fillStyle = gradient;
                
                // Gambar bar di tengah canvas (mirror effect)
                canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
                canvasCtx.fillRect(x, 0, barWidth, barHeight);
                
                x += barWidth + 1;
            }
        }
        
        // Mulai animasi
        draw();
    } catch (error) {
        console.error('Error initializing audio visualizer:', error);
    }
}

// Fungsi untuk memulai visualisasi audio
function startAudioVisualizer() {
    try {
        // Buat media stream dari mikrofon
        navigator.mediaDevices.getUserMedia({ audio: true, video: false })
            .then(stream => {
                // Buat source dari stream
                const source = audioContext.createMediaStreamSource(stream);
                
                // Hubungkan source ke analyser
                source.connect(analyser);
                
                // Simpan stream untuk dibersihkan nanti
                window.currentStream = stream;
            })
            .catch(error => {
                console.error('Error accessing microphone:', error);
            });
    } catch (error) {
        console.error('Error starting audio visualizer:', error);
    }
}

// Fungsi untuk menghentikan visualisasi audio
function stopAudioVisualizer() {
    // Hentikan stream mikrofon jika ada
    if (window.currentStream) {
        window.currentStream.getTracks().forEach(track => track.stop());
        window.currentStream = null;
    }
    
    // Hentikan animation frame
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    
    // Reset visualisasi
    const canvas = document.getElementById('waveform');
    const canvasCtx = canvas.getContext('2d');
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
}

// Vosk fallback untuk speech recognition (tidak diimplementasikan secara penuh)
function initVoskRecognition() {
    // Dalam implementasi nyata, Anda perlu mengunduh model Vosk untuk Bahasa Indonesia
    // dan mengimplementasikan logika fallback di sini
    console.log('Vosk fallback tidak diimplementasikan dalam demo ini');
    
    // Tampilkan pesan ke pengguna
    Swal.fire({
        icon: 'info',
        title: 'Pengenalan Suara Alternatif',
        text: 'Dalam implementasi lengkap, aplikasi akan menggunakan Vosk sebagai alternatif pengenalan suara offline.',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true
    });
}

// Fungsi untuk menangani variasi lebar layar
function handleResize() {
    // Resize canvas
    const canvas = document.getElementById('waveform');
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
}

// Tambahkan event listener untuk resize
window.addEventListener('resize', handleResize);

// Fungsi untuk menginisialisasi voices saat halaman dimuat
function initVoices() {
    // Di beberapa browser, getVoices() memerlukan callback
    window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
    };
    
    // Panggil getVoices untuk inisialisasi
    window.speechSynthesis.getVoices();
}

// Panggil fungsi inisialisasi voices
initVoices();

// Implementasi fallback untuk browser yang tidak mendukung Speech Recognition
function setupFallbackRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        document.getElementById('start-btn').addEventListener('click', () => {
            Swal.fire({
                icon: 'info',
                title: 'Fitur Tidak Didukung',
                text: 'Browser Anda tidak mendukung fitur pengenalan suara. Silakan gunakan mode teks sebagai alternatif.',
                showConfirmButton: false,
                timer: 3000,
                timerProgressBar: true
            });
            
            // Aktifkan mode teks secara otomatis
            document.getElementById('input-container').classList.add('active');
        });
    }
}

// Panggil setup fallback
setupFallbackRecognition();

// Fungsi untuk menyimpan riwayat chat
function saveChat(message, sender) {
    try {
        // Dapatkan riwayat chat dari local storage atau buat baru jika belum ada
        let chatHistory = JSON.parse(localStorage.getItem('tricoChat')) || [];
        
        // Tambahkan pesan baru ke riwayat
        chatHistory.push({
            message: message,
            sender: sender,
            timestamp: new Date().toISOString()
        });
        
        // Batasi riwayat chat hingga 50 pesan terakhir
        if (chatHistory.length > 50) {
            chatHistory = chatHistory.slice(chatHistory.length - 50);
        }
        
        // Simpan kembali ke local storage
        localStorage.setItem('tricoChat', JSON.stringify(chatHistory));
    } catch (error) {
        console.error('Error saving chat history:', error);
    }
}

// Fungsi untuk memuat riwayat chat
function loadChatHistory() {
    try {
        // Dapatkan riwayat chat dari local storage
        const chatHistory = JSON.parse(localStorage.getItem('tricoChat')) || [];
        
        // Tampilkan 10 pesan terakhir jika ada
        if (chatHistory.length > 0) {
            // Hanya tampilkan 10 pesan terakhir
            const recentMessages = chatHistory.slice(Math.max(chatHistory.length - 10, 0));
            
            // Clear pesan selamat datang
            document.getElementById('chat-messages').innerHTML = '';
            
            // Tampilkan pesan dari riwayat
            recentMessages.forEach(item => {
                showMessage(item.message, item.sender);
            });
        }
    } catch (error) {
        console.error('Error loading chat history:', error);
    }
}

// Panggil fungsi untuk memuat riwayat chat setelah beberapa detik
setTimeout(loadChatHistory, 1000);

// Update fungsi showMessage untuk menyimpan riwayat
const originalShowMessage = showMessage;
showMessage = function(text, sender) {
    // Panggil fungsi asli
    originalShowMessage(text, sender);
    
    // Simpan ke riwayat
    saveChat(text, sender);
};

// Tambahkan fungsi untuk membersihkan riwayat
function clearChatHistory() {
    Swal.fire({
        title: 'Hapus Riwayat Chat?',
        text: 'Semua riwayat percakapan akan dihapus. Tindakan ini tidak dapat dibatalkan.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#00cc7a',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Ya, Hapus',
        cancelButtonText: 'Batal'
    }).then((result) => {
        if (result.isConfirmed) {
            // Hapus riwayat dari local storage
            localStorage.removeItem('tricoChat');
            
            // Hapus pesan dari tampilan
            document.getElementById('chat-messages').innerHTML = '';
            
            // Tambahkan kembali pesan selamat datang
            showMessage('Halo! Saya Trico, asisten AI berbahasa Indonesia. Mau ngobrol tentang apa hari ini?', 'ai');
            
            Swal.fire(
                'Terhapus!',
                'Riwayat percakapan telah dihapus.',
                'success'
            );
        }
    });
}

// Tambahkan tombol untuk membersihkan riwayat
function addClearHistoryButton() {
    const buttonContainer = document.querySelector('.button-container');
    const clearBtn = document.createElement('button');
    clearBtn.id = 'clear-btn';
    clearBtn.textContent = 'Hapus Riwayat';
    clearBtn.style.display = 'none'; // Sembunyikan tombol
    clearBtn.addEventListener('click', clearChatHistory);
    buttonContainer.appendChild(clearBtn);
}

// Panggil fungsi untuk menambahkan tombol hapus riwayat
addClearHistoryButton();

// Fungsi untuk mengecek status koneksi
function checkConnectivity() {
    if (!navigator.onLine) {
        Swal.fire({
            icon: 'warning',
            title: 'Tidak Ada Koneksi Internet',
            text: 'Beberapa fitur mungkin tidak akan berfungsi tanpa koneksi internet. Mode teks masih dapat digunakan.',
            showConfirmButton: false,
            timer: 3000,
            timerProgressBar: true
        });
    }
}

// Panggil fungsi untuk mengecek koneksi saat halaman dimuat
checkConnectivity();

// Tambahkan event listener untuk perubahan status koneksi
window.addEventListener('online', () => {
    document.getElementById('status-text').textContent = 'Siap mendengarkan';
});

window.addEventListener('offline', () => {
    document.getElementById('status-text').textContent = 'Offline - Mode Terbatas';
});

// Tambahkan fungsi untuk mode demo (tanpa API key)
let demoMode = false;

function enableDemoMode() {
    demoMode = true;
    
    window.originalProcessMessage = processMessage;
    processMessage = function(message) {
        const loadingIndicator = addLoadingIndicator();
        
        setTimeout(() => {
            loadingIndicator.remove();
            
            let demoResponse = getDemoResponse(message);
            
            showMessage(demoResponse, 'ai');
            
            const emotion = detectEmotion(demoResponse);
            changeEmotion(emotion);
            
            speakText(demoResponse);
            
            setTimeout(() => {
                if (currentEmotion === emotion) {
                    changeEmotion('neutral');
                }
            }, 5000);
        }, 1500);
    };
    
    Swal.fire({
        icon: 'info',
        title: 'Mode Demo Aktif',
        text: 'Aplikasi berjalan dalam mode demo dengan respons terbatas. Untuk pengalaman lengkap, tambahkan API key OpenRouter.',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true
    });
}

function getDemoResponse(message) {
    message = message.toLowerCase();
    
    if (message.includes('halo') || message.includes('hai') || message.includes('hi')) {
        return 'Halo! Apa kabar? Saya Trico, asisten AI dari Pekalongan. Ada yang bisa saya bantu?';
    } else if (message.includes('kabar')) {
        return 'Alhamdulillah baik. Kayak pemerintah yang selalu bilang ekonomi baik, padahal harga batik di Pekalongan naik terus. Hehe.';
    } else if (message.includes('batik') || message.includes('pekalongan')) {
        return 'Pekalongan terkenal dengan batiknya yang khas. Motif Jlamprang itu favorit saya. Sayang harganya naik terus, inflasi katanya.';
    } else if (message.includes('politik')) {
        return 'Politik itu seperti batik, rumit tapi indah kalau dilihat dari jauh. Tapi kalau dilihat dekat-dekat, banyak cacatnya.';
    } else if (message.includes('makanan') || message.includes('kuliner')) {
        return 'Di Pekalongan wajib coba Nasi Megono, Tauto, dan Pindang Tetel. Jangan lupa cicipi Garang Asem juga!';
    } else if (message.includes('demo') || message.includes('api')) {
        return 'Ini mode demo. Untuk fungsi lengkap, tambahkan API key di pengaturan. Respons saya terbatas tanpa koneksi ke AI sebenarnya.';
    } else {
        return 'Maaf, dalam mode demo respons saya terbatas. Tambahkan API key untuk pengalaman lengkap dengan OpenRouter API.';
    }
}

function updateApiKeyDialog() {
    const originalShowApiKeyDialog = showApiKeyDialog;
    
    showApiKeyDialog = function() {
        Swal.fire({
            title: 'Pengaturan API Trico',
            html: `
            <p style="color: #333; text-align: left; margin-bottom: 15px;">
                Untuk menggunakan Trico, Anda memerlukan API key dari Sadid.
                <br>Minta API key di <a href="https://rafifsadid.my.id" target="_blank" style="color: #00cc7a;">rafifsadid.my</a>
            </p>
            <input id="api-key-input" class="swal2-input" placeholder="Masukkan API Key">
            `,
            showCancelButton: true,
            showDenyButton: true,
            confirmButtonText: 'Simpan',
            denyButtonText: 'Mode Demo',
            cancelButtonText: 'Batal',
            confirmButtonColor: '#00cc7a',
            denyButtonColor: '#3085d6',
            backdrop: `rgba(0,0,0,0.8)`,
            preConfirm: () => {
                const inputKey = document.getElementById('api-key-input').value;
                if (!inputKey) {
                    Swal.showValidationMessage('API key diperlukan');
                    return false;
                }
                return inputKey;
            }
        }).then((result) => {
            if (result.isConfirmed) {
                apiKey = result.value;
                localStorage.setItem('tricoApiKey', apiKey);
                validateApiKey(apiKey);
            } else if (result.isDenied) {
                enableDemoMode();
            }
        });
    };
}

updateApiKeyDialog();

if (!apiKey) {
    showApiKeyDialog();
}
