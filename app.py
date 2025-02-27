from io import BytesIO
from google.cloud import speech
from pydub import AudioSegment
import io
import openai
import json
import os
from google.cloud import texttospeech
import pygame
import requests
from flask import Flask, render_template, request, jsonify, send_file
from groq import Groq
 

app = Flask(__name__)




clients = []



@app.route('/')
def index():
    return render_template('index.html')

history_filePath = "DataSet.json"
reminder_filePath = "reminder.json"
stt_credentials_file = "credentials/stt_credentials.json"
os.environ["GOOGLE_APPLICATION_CREDENTIALS"]="credentials/stt_credentials.json"

safety_settings_default = [
  {
    "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    "threshold": "BLOCK_NONE"
  },
  {
    "category": "HARM_CATEGORY_HATE_SPEECH",
    "threshold": "BLOCK_NONE"
  },
  {
    "category": "HARM_CATEGORY_HARASSMENT",
    "threshold": "BLOCK_NONE"
  },
  {
    "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
    "threshold": "BLOCK_NONE"
  }
]

# Dil çiftlerine göre özel talimatlar
language_instructions = {
    # Türkçe -> İngilizce
    "tr-en": """
        Translate text from Turkish to English. Respond with the translation only, maintaining the original meaning and correcting typos if necessary.
        
        # Output Format
        - Provide the translated text only, with no additional commentary or content.
        
        # Example
        Input (Turkish): "Merhaba, nasılsınız?"
        Output (English): "Hello, how are you?"
    """,
    
    # İngilizce -> Türkçe
    "en-tr": """
        Translate text from English to Turkish. Respond with the translation only, maintaining the original meaning and correcting typos if necessary.
        
        # Output Format
        - Provide the translated text only, with no additional commentary or content.
        
        # Example
        Input (English): "Hello, how are you?"
        Output (Turkish): "Merhaba, nasılsınız?"
    """,
    
    # Fransızca -> Türkçe
    "fr-tr": """
        Translate text from French to Turkish. Respond with the translation only, maintaining the original meaning and correcting typos if necessary.
        
        # Output Format
        - Provide the translated text only, with no additional commentary or content.
        
        # Example
        Input (French): "Bonjour, comment allez-vous?"
        Output (Turkish): "Merhaba, nasılsınız?"
    """,
    
    # Türkçe -> Fransızca
    "tr-fr": """
        Translate text from Turkish to French. Respond with the translation only, maintaining the original meaning and correcting typos if necessary.
        
        # Output Format
        - Provide the translated text only, with no additional commentary or content.
        
        # Example
        Input (Turkish): "Merhaba, nasılsınız?"
        Output (French): "Bonjour, comment allez-vous?"
    """,
    
    # İspanyolca -> Türkçe
    "es-tr": """
        Translate text from Spanish to Turkish. Respond with the translation only, maintaining the original meaning and correcting typos if necessary.
        
        # Output Format
        - Provide the translated text only, with no additional commentary or content.
        
        # Example
        Input (Spanish): "Hola, ¿cómo estás?"
        Output (Turkish): "Merhaba, nasılsınız?"
    """,
    
    # Türkçe -> İspanyolca
    "tr-es": """
        Translate text from Turkish to Spanish. Respond with the translation only, maintaining the original meaning and correcting typos if necessary.
        
        # Output Format
        - Provide the translated text only, with no additional commentary or content.
        
        # Example
        Input (Turkish): "Merhaba, nasılsınız?"
        Output (Spanish): "Hola, ¿cómo estás?"
    """,
    
    # Rusça -> Türkçe
    "ru-tr": """
        Translate text from Russian to Turkish. Respond with the translation only, maintaining the original meaning and correcting typos if necessary.
        
        # Output Format
        - Provide the translated text only, with no additional commentary or content.
        
        # Example
        Input (Russian): "Привет, как дела?"
        Output (Turkish): "Merhaba, nasılsınız?"
    """,
    
    # Türkçe -> Rusça
    "tr-ru": """
        Translate text from Turkish to Russian. Respond with the translation only, maintaining the original meaning and correcting typos if necessary.
        
        # Output Format
        - Provide the translated text only, with no additional commentary or content.
        
        # Example
        Input (Turkish): "Merhaba, nasılsınız?"
        Output (Russian): "Привет, как дела?"
    """,
    
    # Varsayılan talimat (bilinmeyen dil çiftleri için)
    "default": """
        Translate the input text from the source language to the target language. Respond with the translation only, maintaining the original meaning and correcting typos if necessary.
        
        # Output Format
        - Provide the translated text only, with no additional commentary or content.
    """
}

# Varsayılan talimat
Custom_Instruction = language_instructions["default"]

def recognize_speech(audio_content, sample_rate, language='tr'):
    """
    Ses dosyasını metne dönüştürür.
    """
    print("Ses dosyasını metne dönüştürüyor...")
    try:
        # Geçici dosya oluştur
        with io.BytesIO(audio_content) as audio_file:
            audio_file.name = "temp.wav"
            
            transcription = client_groq.audio.transcriptions.create(
                file=(audio_file.name, audio_file.read()), # Required audio file
                model="whisper-large-v3-turbo", # Required model to use for transcription
                prompt="Specify context or spelling",  # Optional
                response_format="json",  # Optional
                language=language,  # Kullanıcının seçtiği dil
                temperature=0.0  # Optional
            )
            print(transcription.text)
            return transcription.text
    except Exception as e:
        print(f"STT Hatası: {str(e)}")
        return None

def main_speech_recognition_flow(audio, language='tr'):
    """
    Ses dosyasını işleyerek metne dönüştürür.
    Kaynak dosyanın WAV formatında olduğunu varsayar.
    """
    try:
        text = recognize_speech(audio, None, language)
        if text is None:
            raise Exception("Ses tanıma başarısız oldu")
        return text
    except Exception as e:
        print(f"Ses işleme hatası: {str(e)}")
        return None


def clear_newLine(text):
    text = text.replace("\n", " ")
    text = text.replace("*", "")
    return text

def write_json(Soru, answer, filePath):
    data = read_json(filePath)
    clearAnswer = clear_newLine(answer)
    jsonData = {"Soru": Soru, "answer": clearAnswer}
    data.append(jsonData)
    with open(filePath, "w", encoding="utf-8") as outfile:
        json.dump(data, outfile, ensure_ascii=False, indent=4)

def read_json(filePath=history_filePath):
    try:
        with open(filePath, "r", encoding="utf-8") as infile:
            data = json.load(infile)
    except (FileNotFoundError, json.JSONDecodeError):
        data = []
    return data

def synthesize_speech_from_google(text, language='tr'):
    """
    Google Text-to-Speech kullanarak metni sese dönüştürür ve JSON'daki yapılandırmaya uygun olarak çalışır.
    """
    client = texttospeech.TextToSpeechClient()

    # Metin girişini ayarla
    synthesis_input = texttospeech.SynthesisInput(text=text)

    # Dile göre uygun ses seçimi
    voice_map = {
        'tr': {'code': 'tr-TR', 'name': 'tr-TR-Wavenet-C'},
        'en': {'code': 'en-US', 'name': 'en-US-Wavenet-D'},
        'fr': {'code': 'fr-FR', 'name': 'fr-FR-Wavenet-C'},
        'es': {'code': 'es-ES', 'name': 'es-ES-Wavenet-C'},
        'ru': {'code': 'ru-RU', 'name': 'ru-RU-Wavenet-D'}
    }
    
    voice_config = voice_map.get(language, voice_map['tr'])
    
    voice = texttospeech.VoiceSelectionParams(
        language_code=voice_config['code'],
        name=voice_config['name']
    )

    # Ses dosyası ayarlarını yapılandır
    audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.LINEAR16,  # LINEAR16 format
        effects_profile_id=["large-automotive-class-device"],  # Efekt profili
        pitch=-6.8,  # Ses tonunu ayarla
        speaking_rate=1.15  # Konuşma hızını ayarla
    )

    # TTS işlemini gerçekleştir
    response = client.synthesize_speech(
        input=synthesis_input,
        voice=voice,
        audio_config=audio_config
    )

    # Ses verilerini bellekte saklayın
    audio_file = BytesIO(response.audio_content)
    audio_file.seek(0)  # Bellek içindeki dosyanın başlangıcına gidin
    print("TTS işlemi tamamlandı, ses bellekte oluşturuldu.")
    return audio_file


def play_pyGame(filePath="output.mp3"):
    pygame.mixer.init()
    pygame.mixer.music.load(filePath)
    pygame.mixer.music.play()
    while pygame.mixer.music.get_busy():
        pygame.time.Clock().tick(10)
    pygame.quit()

def clear_json_(filePath):
    try:
        if os.path.exists(filePath):
            os.remove(filePath)
    except Exception as e:
        print(f"Hata oluştu: {e}")

def create_prompt(custom_instruction, input, history, caption, emotion, source_lang='tr', target_lang='en'):
    language_names = {
        'tr': 'Turkish',
        'en': 'English',
        'fr': 'French',
        'es': 'Spanish',
        'ru': 'Russian'
    }
    source_name = language_names.get(source_lang, 'Unknown')
    target_name = language_names.get(target_lang, 'Unknown')

    #return f"Translate from {source_name} ({source_lang}) to {target_name} ({target_lang}). Geçmiş konuşmalar: {history} Input: {input}"
    return f"Translate from {source_name} ({source_lang}) to {target_name} ({target_lang}). Input: {input}"

def run_assistant(ci, audio, ip_address, source_language='tr', target_language='en'):
    try:
        # Gelen WAV dosyasını işleyerek metne dönüştür
        Soru = main_speech_recognition_flow(audio, source_language)
        if Soru:
            print(f"Tanınan metin: {Soru}")
        else:
            print("Ses tanınamadı.")
    except Exception as e:
        print(f"Assistant hata verdi: {e}")
        return

    if Soru is None:
        print("Soru tanımlanamadı. Ses anlaşılamadı veya boş.")
        return  # Fonksiyonu sonlandır veya bir hata mesajı döndür

    # Dil çiftine göre uygun talimatı seç
    language_pair = f"{source_language}-{target_language}"
    instruction = language_instructions.get(language_pair, language_instructions["default"])

    # Geçmiş konuşmaları al
    history_data = read_json(f"{ip_address}.json")

    # Eğer eleman sayısı 7'den fazlaysa son 7 elemanı al
    if len(history_data) > 7:
        history_data = history_data[-7:]

    # JSON'u stringe dönüştür
    history = json.dumps(history_data, ensure_ascii=False)

    prompt = create_prompt(instruction, Soru, history, None, "", source_language, target_language)

    response = openai.chat.completions.create(
            model='gpt-4o-mini',
            messages=[
                {"role": "system", "content": f"{instruction}"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,  # Allows for creative enhancements
            frequency_penalty=0.0,  # Doesn't penalize word repetition
            presence_penalty=0.0  # Neutral towards new topics
    )

    result = response.choices[0].message.content
    print(f"AI çıktısı: {result}")


    write_json(Soru=Soru, answer=result, filePath=f"{ip_address}.json")
    tts = synthesize_speech_from_google(clear_newLine(result), target_language)
    return tts

@app.route('/activate_assistant', methods=['POST'])
def activate_assistant():
    try:
        if 'audio' not in request.files:
            return jsonify({"error": "Ses dosyası bulunamadı"}), 400
            
        audio_file = request.files['audio']
        if audio_file.filename == '':
            return jsonify({"error": "Dosya seçilmedi"}), 400
            
        audio_content = audio_file.read()
        if not audio_content:
            return jsonify({"error": "Boş ses dosyası"}), 400

        # Dil bilgisini al
        source_language = request.form.get('source_language', 'tr')
        target_language = request.form.get('target_language', 'en')

        # İstemci IP adresini al
        ip_address = request.headers.get('X-Real-IP') or request.headers.get('X-Forwarded-For') or request.remote_addr
        
        # Assistant'ı çalıştır
        tts = run_assistant(Custom_Instruction, audio_content, ip_address, source_language, target_language)
        if tts is None:
            return jsonify({"error": "Ses işleme hatası"}), 500

        return send_file(tts, mimetype="audio/wav")
        
    except Exception as e:
        print(f"Aktivasyon hatası: {str(e)}")
        return jsonify({"error": "İşlem sırasında hata oluştu"}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8001, debug=True)
