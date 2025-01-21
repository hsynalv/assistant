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

document.addEventListener('DOMContentLoaded', function () {
    const eventSource = new EventSource('/events');
    customInstruction = defaultCustomInstruction; // Reset to default on page load
    eventSource.onmessage = function (event) {
        if (event.data === "Activate Felix") {
            activateFelix();
        }
    };
});

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

// Activate Felix Function
function activateFelix() {
    const ci = customInstruction; // Current custom instruction
    const currentSafetySettings = JSON.parse(localStorage.getItem('safetySettings')) || defaultSafetySettings;

    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            const audioChunks = [];

            // Show microphone animation when recording starts
            showMicAnimation();

            mediaRecorder.ondataavailable = event => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = () => {
                // Hide microphone animation
                hideMicAnimation();

                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const formData = new FormData();

                formData.append('audio', audioBlob, 'input.webm');
                formData.append('custom_instruction', ci);
                formData.append('safety_settings', JSON.stringify(currentSafetySettings));

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

                    // Show speaking animation while audio is playing
                    showSpeakingAnimation();

                    audioPlayer.onended = () => {
                        hideSpeakingAnimation(); // Stop speaking animation when audio ends

                        // Kaydın bitişinden sonra tekrar başlat
                        activateFelix();
                    };

                    audioPlayer.play();
                })
                .catch(error => {
                    console.error('Hata:', error);

                    // Hata durumunda döngüyü yeniden başlat
                    activateFelix();
                });
            };

            mediaRecorder.start();
            console.log("Kayıt başladı...");

            // Kaydı 5 saniyede otomatik durdur
            setTimeout(() => {
                mediaRecorder.stop();
                console.log("Kayıt durduruldu.");
            }, 5000);
        })
        .catch(error => {
            console.error('Mikrofon erişimi reddedildi:', error);

            // Hata durumunda döngüyü yeniden başlat
            setTimeout(() => activateFelix(), 1000);
        });
}




function deactivateFelix() {
    userMadeDecision = true;
    felix.classList.remove("active");
    felix.classList.add("inactive");
    setTimeout(function() {
        felix.classList.remove("inactive");
    }, 750);

    // Fetch request to the Flask server
    fetch('/deactivate_felix', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Deactivation request failed.');
        }
        return response.json();
    })
    .then(data => {
        console.log(data.message);
    })
    .catch(error => {
        console.error('Error:', error);
    });
}

function getSafetySettings() {
    const switches = document.querySelectorAll('.switch input');
    const categories = [
        "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        "HARM_CATEGORY_HATE_SPEECH",
        "HARM_CATEGORY_HARASSMENT",
        "HARM_CATEGORY_DANGEROUS_CONTENT"
    ];

    safetySettings = Array.from(switches).map((switchInput, index) => ({
        category: categories[index],
        threshold: switchInput.checked ? "BLOCK_NONE" : "NEGLIGIBLE"
    }));

    // Save the updated settings to localStorage
    localStorage.setItem('safetySettings', JSON.stringify(safetySettings));
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
    deactivateFelix();
}

function getDocument() {

    responseMessage.innerText = `Hatırlatıcı eklemek için 'Hatırlatıcı kur' diye Felix'e seslenin.
    Hatırlatıcıları okuması için 'Hatırlatıcıları oku' diye Felix'e seslenin.
    Geçmişi temizlemek için 'Geçmişi Temizle' diye felix'e seslenin.
    Felix'i  kapatmak için 'Programı kapat' diye Felix'e seslenin.
    `;
    showResponse();
}
changeTheme(SiteTheme.Dark);