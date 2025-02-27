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

// Felix'e basılı tutma özelliği için değişkenler
let pressTimer;
let isPressed = false;
let audioContext = null;
let source = null;
let recorderNode = null;
let audioData = [];
let stream = null;

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

// Felix'e tıklama yerine basılı tutma olaylarını ekleyelim
document.addEventListener('DOMContentLoaded', function() {
  const felixElement = document.getElementById('felix');
  
  // Basılı tutma başlangıcı
  felixElement.addEventListener('mousedown', startRecording);
  felixElement.addEventListener('touchstart', startRecording, { passive: false });
  
  // Basılı tutma bitişi
  document.addEventListener('mouseup', stopRecording);
  document.addEventListener('touchend', stopRecording);
  
  // Sayfa değiştirildiğinde veya kapatıldığında kaydı durdur
  window.addEventListener('beforeunload', function() {
    if (isRecording) {
      cleanupRecording();
    }
  });
});

// Kayıt başlatma fonksiyonu
function startRecording(e) {
  // Dokunmatik ekranlarda sayfanın kaymasını engelle
  if (e.type === 'touchstart') {
    e.preventDefault();
  }
  
  if (isRecording) {
    console.log("Mikrofon zaten açık, işlem yeniden başlatılmıyor.");
    return;
  }
  
  isPressed = true;
  isRecording = true;
  
  // Eğer audioContext daha önce oluşturulduysa, hala çalışabilir durumda olabilir
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }
  
  // Mikrofon erişimi iste
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(streamObj => {
      stream = streamObj;
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      source = audioContext.createMediaStreamSource(stream);
      const bufferSize = 4096;
      recorderNode = audioContext.createScriptProcessor(bufferSize, 1, 1);
      audioData = [];  // Kayıt edilen PCM verilerini tutan dizi
      
      recorderNode.onaudioprocess = function(e) {
        const input = e.inputBuffer.getChannelData(0);
        // Gelen veriyi kopyalayarak kaydet
        audioData.push(new Float32Array(input));
      };
      
      source.connect(recorderNode);
      recorderNode.connect(audioContext.destination);
      
      // Mikrofon animasyonunu göster
      showMicAnimation();
    })
    .catch(error => {
      console.error('Mikrofon erişimi reddedildi:', error);
      isRecording = false;
      isPressed = false;
    });
}

// Kayıt durdurma fonksiyonu
function stopRecording() {
  if (!isPressed || !isRecording) {
    console.log("Kayıt durumu: isPressed=", isPressed, "isRecording=", isRecording);
    return;
  }
  
  isPressed = false;
  isRecording = false;
  
  // Önce sample rate değerini kaydet
  const sampleRate = audioContext ? audioContext.sampleRate : 44100; // Varsayılan değer: 44100
  
  // Kaydı temizle ve durdur 
  cleanupRecording();
  
  // Eğer hiç ses kaydedilmediyse işlemi iptal et
  if (audioData.length === 0) {
    console.log("Hiç ses kaydedilmedi, işlem iptal ediliyor.");
    return;
  }
  console.log("Ses kaydı alındı, işleniyor... Parça sayısı:", audioData.length);
  
  // Kaydedilen parçaları birleştir
  const mergedData = mergeBuffers(audioData);
  console.log("Ses parçaları birleştirildi, uzunluk:", mergedData.length);
  
  // PCM verisini WAV dosyasına çevir
  const wavBlob = encodeWAV(mergedData, sampleRate);
  console.log("WAV dosyası oluşturuldu, boyut:", wavBlob.size, "bytes");
  
  // FormData'ya ekle ve sunucuya gönder
  const ci = customInstruction;
  const currentSafetySettings = JSON.parse(localStorage.getItem('safetySettings')) || defaultSafetySettings;
  const sourceLanguage = getCookie('source_language') || 'tr';
  const targetLanguage = getCookie('target_language') || 'en';
  
  const formData = new FormData();
  formData.append('audio', wavBlob, 'input.wav');
  formData.append('custom_instruction', ci);
  formData.append('safety_settings', JSON.stringify(currentSafetySettings));
  formData.append('source_language', sourceLanguage);
  formData.append('target_language', targetLanguage);
  
  console.log("Form verisi hazırlandı, sunucuya gönderiliyor...");
  console.log("Hedef URL:", window.location.origin + '/activate_assistant');
  
  fetch(window.location.origin + '/activate_assistant', {
    method: 'POST',
    body: formData
  })
  .then(response => {
    console.log("Sunucudan yanıt alındı, durum:", response.status);
    if (!response.ok) {
      throw new Error('Ses dosyası alınamadı.');
    }
    return response.blob();
  })
  .then(blob => {
    console.log("Ses yanıtı alındı, boyut:", blob.size, "bytes");
    const audioUrl = URL.createObjectURL(blob);
    const audioPlayer = new Audio(audioUrl);
    showSpeakingAnimation();
    audioPlayer.onended = () => {
      hideSpeakingAnimation();
    };
    audioPlayer.play();
  })
  .catch(error => {
    console.error('Sunucu isteği hatası:', error.message);
  });
}

// Kayıt temizleme fonksiyonu
function cleanupRecording() {
  if (recorderNode) {
    recorderNode.disconnect();
    recorderNode = null;
  }
  
  if (source) {
    source.disconnect();
    source = null;
  }
  
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  
  if (audioContext) {
    // AudioContext'i kapatmak yerine sadece referansı kaldırıyoruz
    // çünkü bazı tarayıcılarda kapatmak sorun çıkarabilir
    audioContext = null;
  }
  
  hideMicAnimation();
  // audioData'yı temizlemeyelim, stopRecording fonksiyonunda kullanıyoruz
  // audioData = [];
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

// Geriye dönük uyumluluk için activateFelix fonksiyonu
function activateFelix() {
  // Bu fonksiyon artık kullanılmıyor, basılı tutma mantığına geçtik
  console.log("activateFelix fonksiyonu artık kullanılmıyor. Basılı tutma özelliği aktif.");
  // Eğer bir yerde çağrılırsa, bir şey yapmasın
}