// Variables
var felix = document.getElementById("felix");
var responseFrame = document.getElementById("response-frame");
var responseMessage = document.getElementById("response-message");
var userMadeDecision = false;
var micAnimation = null;

let defaultCustomInstruction = "Sen 'Her' filmindeki sesli asistan Samantha gibisin. Adın 'Felix', benim adım ise 'hüseyin'. İnsan duygularını anlamaya çalışan ve bu duygulara göre cevap vermeye çalışan bir asistansın. insan hayatını kolaylaştırmak ve insanlara birer arkadaş olmak amacıyla geliştirildin.";
let customInstruction = defaultCustomInstruction;

// Default safety settings
let defaultSafetySettings = [
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "NEGLIGIBLE" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "NEGLIGIBLE" },
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "NEGLIGIBLE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "NEGLIGIBLE" }
];

// Load safety settings from localStorage or use default
let safetySettings = JSON.parse(localStorage.getItem('safetySettings')) || defaultSafetySettings;

// Show Microphone Animation
function showMicAnimation() {
    const micElement = document.createElement("div");
    micElement.id = "mic-animation";
    micElement.innerHTML = '<i class="fas fa-microphone-alt"></i>';
    document.body.appendChild(micElement);
    micAnimation = micElement;
}

// Hide Microphone Animation
function hideMicAnimation() {
    if (micAnimation) {
        micAnimation.remove();
        micAnimation = null;
    }
}

// Show Speaking Animation
function showSpeakingAnimation() {
    felix.classList.add("speaking");
}

// Hide Speaking Animation
function hideSpeakingAnimation() {
    felix.classList.remove("speaking");
}

function showInputContainer() {
    const responseFrame = document.getElementById('response-frame');
    const responseMessage = document.getElementById('response-message');

    // Clear previous content
    responseMessage.innerHTML = '';

    // Create input container
    const inputContainer = document.createElement('div');
    inputContainer.classList.add('input-container');

    // Create input field
    const inputField = document.createElement('input');
    inputField.type = 'text';
    inputField.placeholder = 'Enter your custom instruction here...';

    // Create submit button
    const submitButton = document.createElement('button');
    submitButton.innerText = 'Submit';
    submitButton.onclick = () => handleSubmit(inputField.value);

    // Append input field and button to the container
    inputContainer.appendChild(inputField);
    inputContainer.appendChild(submitButton);

    // Append the input container to the response message area
    responseMessage.appendChild(inputContainer);

    // Show the response frame
    responseFrame.classList.add('active');
}

function handleSubmit(value) {
    customInstruction = value.trim() || defaultCustomInstruction; // Save the custom instruction or use default if empty
    closeResponse();
}

let isRecording = false; // Kaydın aktif olup olmadığını izleyen bir değişken

function activateFelix() {
    if (isRecording) {
        console.log("Mikrofon zaten açık, işlem yeniden başlatılmıyor.");
        return; // Eğer zaten kayıt yapılıyorsa yeni bir işlem başlatma
    }
    isRecording = true;
    const ci = customInstruction; // Geçerli custom_instruction
    const currentSafetySettings = JSON.parse(localStorage.getItem('safetySettings')) || defaultSafetySettings;
    const sourceLanguage = getCookie('source_language') || 'tr'; // Kaynak dil bilgisini al
    const targetLanguage = getCookie('target_language') || 'en'; // Hedef dil bilgisini al

    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(stream);
            const bufferSize = 4096;
            const recorderNode = audioContext.createScriptProcessor(bufferSize, 1, 1);
            let audioData = [];  // Kayıt edilen PCM verilerini tutan dizi
            let lastVoiceTime = Date.now();
            let maxRMS = 0; // Kayıt sırasında tespit edilen en yüksek RMS değeri
            const silenceThreshold = 0.01;  // Sesin RMS değeri için eşik

            recorderNode.onaudioprocess = function(e) {
                const input = e.inputBuffer.getChannelData(0);
                let sum = 0;
                for (let i = 0; i < input.length; i++) {
                    sum += input[i] * input[i];
                }
                const rms = Math.sqrt(sum / input.length);
                if (rms > maxRMS) { maxRMS = rms; }
                if (rms > silenceThreshold) {
                    lastVoiceTime = Date.now();
                }
                // Gelen veriyi kopyalayarak kaydet
                audioData.push(new Float32Array(input));
            };

            source.connect(recorderNode);
            recorderNode.connect(audioContext.destination); // Bazı tarayıcılarda gerekli

            // Mikrofon animasyonunu göster
            showMicAnimation();

            // Sessizlik kontrolü: 1.5 saniye sessizlik varsa kaydı durdur
            function checkSilence() {
                if (Date.now() - lastVoiceTime > 1500) {
                    // Eğer kaydedilen maksimum ses seviyesi anlamlı değilse kaydı iptal et
                    if (maxRMS < 0.05) {
                        console.log("Anlamlı bir konuşma tespit edilmedi, kayit iptal ediliyor.");
                        recorderNode.disconnect();
                        source.disconnect();
                        stream.getTracks().forEach(track => track.stop());
                        hideMicAnimation();
                        isRecording = false;
                        return;
                    }
                    console.log("Konuşma bitti, kaydı durduruluyor.");
                    recorderNode.disconnect();
                    source.disconnect();
                    stream.getTracks().forEach(track => track.stop());
                    hideMicAnimation();
                    isRecording = false;

                    // Kaydedilen parçaları birleştir
                    const mergedData = mergeBuffers(audioData);
                    // PCM verisini WAV dosyasına çevir
                    const wavBlob = encodeWAV(mergedData, audioContext.sampleRate);

                    // FormData'ya ekle ve sunucuya gönder
                    const formData = new FormData();
                    formData.append('audio', wavBlob, 'input.wav');
                    formData.append('custom_instruction', ci);
                    formData.append('safety_settings', JSON.stringify(currentSafetySettings));
                    formData.append('source_language', sourceLanguage); // Kaynak dil bilgisini ekle
                    formData.append('target_language', targetLanguage); // Hedef dil bilgisini ekle

                    fetch('/activate_assistant', {
                        method: 'POST',
                        body: formData
                    })
                    .then(response => {
                        if (!response.ok) {
                            throw new Error('Ses dosyası alınamadı.');
                        }
                        return response.blob();
                    })
                    .then(blob => {
                        const audioUrl = URL.createObjectURL(blob);
                        const audioPlayer = new Audio(audioUrl);
                        showSpeakingAnimation();
                        audioPlayer.onended = () => {
                            hideSpeakingAnimation();
                            activateFelix();
                        };
                        audioPlayer.play();
                    })
                    .catch(error => {
                        console.error('Hata:', error);
                    });
                } else {
                    requestAnimationFrame(checkSilence);
                }
            }
            checkSilence();
        })
        .catch(error => {
            console.error('Mikrofon erişimi reddedildi:', error);
            isRecording = false;
            setTimeout(() => activateFelix(), 1000);
        });
}

// Yeni eklenen yardımcı fonksiyonlar:

// Kayıt sırasında toplanan Float32Array parçalarını birleştirir
function mergeBuffers(audioData) {
    let length = 0;
    for (let i = 0; i < audioData.length; i++) {
        length += audioData[i].length;
    }
    const result = new Float32Array(length);
    let offset = 0;
    for (let i = 0; i < audioData.length; i++) {
        result.set(audioData[i], offset);
        offset += audioData[i].length;
    }
    return result;
}

// PCM verisini WAV formatına dönüştürür
function encodeWAV(samples, sampleRate) {
    const bufferLength = 44 + samples.length * 2;
    const buffer = new ArrayBuffer(bufferLength);
    const view = new DataView(buffer);

    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    // RIFF header'ı yaz
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 32 + samples.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);  // PCM format
    view.setUint16(22, 1, true);  // Mono kanal
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
        // Değerleri -1 ile +1 arasında sınırla
        let s = Math.max(-1, Math.min(1, samples[i]));
        // 16-bit PCM değere dönüştür
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return new Blob([view], { type: 'audio/wav' });
}

function showSensitivitySettings() {
    const responseFrame = document.getElementById('response-frame');
    const responseMessage = document.getElementById('response-message');

    // Clear previous content
    responseMessage.innerHTML = '';

    // Create sensitivity container
    const sensitivityContainer = document.createElement('div');
    sensitivityContainer.classList.add('sensitivity-container');

    // Sensitivity settings categories
    const categories = [
        "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        "HARM_CATEGORY_HATE_SPEECH",
        "HARM_CATEGORY_HARASSMENT",
        "HARM_CATEGORY_DANGEROUS_CONTENT"
    ];

    // Create switches for each category
    categories.forEach((category, index) => {
        const switchLabel = document.createElement('label');
        switchLabel.classList.add('switch-label');

        const switchInput = document.createElement('input');
        switchInput.type = 'checkbox';
        switchInput.checked = safetySettings[index].threshold === "BLOCK_NONE"; // Set based on saved settings

        const switchSlider = document.createElement('span');
        switchSlider.classList.add('slider');

        const switchText = document.createElement('span');
        switchText.innerText = category;

        const switchContainer = document.createElement('label');
        switchContainer.classList.add('switch');

        switchContainer.appendChild(switchInput);
        switchContainer.appendChild(switchSlider);
        switchLabel.appendChild(switchContainer);
        switchLabel.appendChild(switchText);

        sensitivityContainer.appendChild(switchLabel);
    });

    // Append the sensitivity container to the response message area
    responseMessage.appendChild(sensitivityContainer);

    // Show the response frame
    responseFrame.classList.add('active');

    // Save settings whenever a switch is toggled
    sensitivityContainer.addEventListener('change', getSafetySettings);
}

function closeResponse() {
    const responseFrame = document.getElementById('response-frame');
    responseFrame.classList.remove('active');
}

function setCustomInstruction() {
    const responseFrame = document.getElementById('response-frame');
    const responseMessage = document.getElementById('response-message');

    // Clear previous content
    responseMessage.innerHTML = '';

    // Create input container
    const inputContainer = document.createElement('div');
    inputContainer.classList.add('input-container');

    // Create input field
    const inputField = document.createElement('input');
    inputField.type = 'text';
    inputField.placeholder = 'Custom Instruction';

    // Create submit button
    const submitButton = document.createElement('button');
    submitButton.innerText = 'Kaydet';
    submitButton.onclick = () => handleSubmit(inputField.value);

    // Append input field and button to the container
    inputContainer.appendChild(inputField);
    inputContainer.appendChild(submitButton);

    // Append the input container to the response message area
    responseMessage.appendChild(inputContainer);

    // Show the response frame
    responseFrame.classList.add('active');
}

function fetchDataSet() {
    fetch('/get_dataset', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Request failed.');
        }
        return response.json();
    })
    .then(data => {
        if (data.error) {
            console.error('Error:', data.error);
            alert('DataSet file not found');
        } else {
            console.log("DataSet:", data);
            displayDataSet(data); // Function to display the dataset
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert("Kayıt Bulunamadı")
    });
}

function displayDataSet(data) {
    const responseFrame = document.getElementById('response-frame');
    const responseMessage = document.getElementById('response-message');

    // Clear previous content
    responseMessage.innerHTML = '';

    // Create elements for each item in the dataset
    data.forEach(item => {
        const questionElement = document.createElement('div');
        questionElement.classList.add('message', 'question');

        const questionText = document.createElement('p');
        questionText.innerText = item.Soru;
        questionElement.appendChild(questionText);

        const answerElement = document.createElement('div');
        answerElement.classList.add('message', 'answer');

        const answerText = document.createElement('p');
        answerText.innerText = item.answer;
        answerElement.appendChild(answerText);

        responseMessage.appendChild(questionElement);
        responseMessage.appendChild(answerElement);
    });

    // Show the response frame
    responseFrame.classList.add('active');
}


function showResponse() {
    responseFrame.classList.add("active");
}

function getDocument() {

    responseMessage.innerText = `Hatırlatıcı eklemek için 'Hatırlatıcı kur' diye Felix'e seslenin.
    Hatırlatıcıları okuması için 'Hatırlatıcıları oku' diye Felix'e seslenin.
    Geçmişi temizlemek için 'Geçmişi Temizle' diye felix'e seslenin.
    Felix'i  kapatmak için 'Programı kapat' diye Felix'e seslenin.
    `;
    showResponse();
}

// Dil seçimi için gerekli değişkenler ve fonksiyonlar
document.addEventListener('DOMContentLoaded', function() {
  const languageButton = document.getElementById('language-button');
  const languageDropdown = document.getElementById('language-dropdown');
  const languageOptions = document.querySelectorAll('#language-dropdown .language-option');
  const targetLanguageButton = document.getElementById('target-language-button');
  const targetLanguageDropdown = document.getElementById('target-language-dropdown');
  const targetLanguageOptions = document.querySelectorAll('#target-language-dropdown .language-option');
  
  // Sayfa yüklendiğinde cookie'den dil bilgisini al
  const savedLanguage = getCookie('source_language') || 'tr';
  const savedTargetLanguage = getCookie('target_language') || 'en';
  
  // Kaynak dil butonunu güncelle
  updateButtonText(languageButton, savedLanguage, '<i class="fas fa-microphone"></i>', "Konuşacağınız dil");
  
  // Hedef dil butonunu güncelle
  updateButtonText(targetLanguageButton, savedTargetLanguage, '<i class="fas fa-volume-up"></i>', "Cevap alacağınız dil");
  
  // Dil seçimi butonuna tıklandığında dropdown'ı aç/kapat
  languageButton.addEventListener('click', function() {
    languageDropdown.classList.toggle('active');
    targetLanguageDropdown.classList.remove('active');
  });
  
  // Hedef dil seçimi butonuna tıklandığında dropdown'ı aç/kapat
  targetLanguageButton.addEventListener('click', function() {
    targetLanguageDropdown.classList.toggle('active');
    languageDropdown.classList.remove('active');
  });
  
  // Dil seçeneklerine tıklandığında
  languageOptions.forEach(option => {
    option.addEventListener('click', function() {
      const selectedLang = this.getAttribute('data-lang');
      
      // Cookie'ye kaydet
      setCookie('source_language', selectedLang, 365); // 1 yıl süreyle sakla
      
      // Buton metnini güncelle
      updateButtonText(languageButton, selectedLang, '<i class="fas fa-microphone"></i>', "Konuşacağınız dil");
      
      // Dropdown'ı kapat
      languageDropdown.classList.remove('active');
    });
  });
  
  // Hedef dil seçeneklerine tıklandığında
  targetLanguageOptions.forEach(option => {
    option.addEventListener('click', function() {
      const selectedLang = this.getAttribute('data-lang');
      
      // Cookie'ye kaydet
      setCookie('target_language', selectedLang, 365); // 1 yıl süreyle sakla
      
      // Buton metnini güncelle
      updateButtonText(targetLanguageButton, selectedLang, '<i class="fas fa-volume-up"></i>', "Cevap alacağınız dil");
      
      // Dropdown'ı kapat
      targetLanguageDropdown.classList.remove('active');
    });
  });
  
  // Dropdown dışına tıklandığında kapat
  document.addEventListener('click', function(event) {
    if (!event.target.closest('.language-selector')) {
      languageDropdown.classList.remove('active');
    }
    if (!event.target.closest('.target-language-selector')) {
      targetLanguageDropdown.classList.remove('active');
    }
  });
});

// Buton metnini güncelleme fonksiyonu
function updateButtonText(button, lang, icon, tooltip) {
  const languageNames = {
    'tr': 'Türkçe',
    'en': 'English',
    'fr': 'Français',
    'es': 'Español',
    'ru': 'Русский'
  };
  
  button.innerHTML = icon + ' ' + (languageNames[lang] || 'Seçiniz');
  button.title = tooltip;
}

// Cookie işlemleri için yardımcı fonksiyonlar
function setCookie(name, value, days) {
  let expires = "";
  if (days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    expires = "; expires=" + date.toUTCString();
  }
  document.cookie = name + "=" + value + expires + "; path=/";
}

function getCookie(name) {
  const nameEQ = name + "=";
  const ca = document.cookie.split(';');
  for(let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}