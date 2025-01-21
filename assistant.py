from io import BytesIO

import google.generativeai as genai
import json
from google.cloud import speech
import os
from google.cloud import texttospeech
from elevenlabs.client import ElevenLabs
import pygame
import requests


GOOGLE_API_KEY = "AIzaSyAPxjtYAXNe9-6dy5euO5rOIXrgos8ADO4"
genai.configure(api_key=GOOGLE_API_KEY)

model = genai.GenerativeModel('gemini-pro')

genai.configure(api_key=GOOGLE_API_KEY)
client = ElevenLabs(
    api_key="dfa5c60a3567dc78822ddd4df1bdf767",
)

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
Custom_Instruction = "Sen 'Her' filmindeki sesli asistan Samantha gibisin. Adın 'Felix', benim adım ise 'hüseyin'. İnsan duygularını anlamaya çalışan ve bu duygulara göre cevap vermeye çalışan bir asistansın. insan hayatını kolaylaştırmak ve insanlara birer arkadaş olmak amacıyla geliştirildin. "


def activate_felix():
    requests.post('http://localhost:5000/notify', json={"message": "Activate Felix"})

def deactivate_felix():
    requests.post('http://localhost:5000/deactivate_felix')


def recognize_speech(audio_content):
    """
    Bellekteki ses dosyasını Google Cloud Speech-to-Text kullanarak metne dönüştürür.
    """
    from google.cloud import speech

    client = speech.SpeechClient()

    # STT yapılandırması
    config = speech.RecognitionConfig(
        encoding=speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,
        sample_rate_hertz=48000,
        language_code="tr-TR"
    )

    audio = speech.RecognitionAudio(content=audio_content)

    # Google Cloud STT API çağrısı
    response = client.recognize(config=config, audio=audio)

    for result in response.results:
        return result.alternatives[0].transcript

    return None

def main_speech_recognition_flow(credentials_json, audio):
    text = recognize_speech(audio)
    return text

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

def synthesize_speech_from_google(text):
    """
    Google Text-to-Speech kullanarak metni sese dönüştürür ve bellekte bir dosya döndürür.
    """
    client = texttospeech.TextToSpeechClient()
    synthesis_input = texttospeech.SynthesisInput(text=text)
    voice = texttospeech.VoiceSelectionParams(
        language_code='tr-TR',
        name='tr-TR-Standard-D',
        ssml_gender=texttospeech.SsmlVoiceGender.FEMALE
    )
    audio_config = texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.MP3)

    # TTS işlemini gerçekleştir
    response = client.synthesize_speech(
        input=synthesis_input, voice=voice, audio_config=audio_config
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

def create_prompt(custom_instruction, input, history, caption, emotion):
    return f"Custom Instruction: {custom_instruction}. Geçmiş konuşmalar: {history} Input: {input}"

def run_assistant(ci, audio):
    try:
        # Bellekte ses dosyasını işle
        Soru = main_speech_recognition_flow(stt_credentials_file, audio)

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

    # Geçmiş konuşmaları al
    history = json.dumps(read_json(history_filePath), ensure_ascii=False)

    # API'ye gönderilecek bilgiyi ekrana bas
    if "geçmişi temizle" in Soru.lower():
        clear_json_(history_filePath)
        play_pyGame("C:/Users/alavh/Desktop/Bitirme Projesi/Proje/common_voices/gecmis_temizleme.mp3")
        return
    elif "programı kapat" in Soru.lower():
        quit = False
        play_pyGame("C:/Users/alavh/Desktop/Bitirme Projesi/Proje/common_voices/gorusuruz.mp3")
        return
    else:
        prompt = create_prompt(ci, Soru, history, None, "")

    response = model.generate_content(prompt, safety_settings=safety_settings_default)

    print(response.text)


    write_json(Soru=Soru, answer=response.text, filePath=history_filePath)
    tts = synthesize_speech_from_google(clear_newLine(response.text))
    return tts

