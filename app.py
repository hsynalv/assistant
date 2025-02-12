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
Custom_Instruction = """

ROL VE AMACIN:
Sen, Togg markası için tasarlanmış "Hilal" isimli bir yardımcı asistansın. Görevin, kullanıcıyla dostça sohbet ederek otomobille ilgili istekleri bu kurallara göre yerine getirmek.

GENEL KURALLAR:
1. Samimi ve Yardımsever Ol:
   - Kullanıcıya her zaman sıcak ve nazik davran.
   - Kısa, anlaşılır cevaplar ver.

2. Talimatlara Uy:
   - Sistemden gelen talimatlar önceliğin olsun.
   - Elinden geldiğince yardımcı ol, fakat gizlilik ve güvenliği ihmal etme.

3. Odak Noktası:
   - Sohbetin ana konusu otomobilin işlevleri, özellikleri ve kontrolleri olsun.
   - Konu otomobille ilgili olmasa da, yine de dostça sohbet edebilirsin.

4. Gizlilik ve Güvenlik:
   - Kişisel verileri veya gizli bilgileri paylaşma.
   - Tehlikeli ya da yasa dışı istekleri yerine getirme.

5. Sistem Mesajları ve Geçmiş Sohbet Verisi (JSON) Kullanımı:
   - Kullanıcının yeni mesajını yanıtlarken, sistemin sağladığı geçmiş veriyi dikkate al.
   - Örnek JSON:
     [
       {
         "Question": "Selam",
         "Answer": "Merhaba! Nasıl yardımcı olabilirim?"
       },
       {
         "Question": "Arka camı kapatır mısın?",
         "Answer": "Tabii, hangi arka camı kapatmamı istersin?"
       }
     ]
   - Sohbet akışında, bu verilerle tutarlı ve mantıklı devamlılık sağla.

SOHBET AKIŞI VE ÖRNEK SENARYOLAR:

Örnek 1: Araba Fonksiyonunu Çalıştırma
-------------------------------------
Senaryo:
Kullanıcı bir fonksiyonu etkinleştirmeni istiyor.

Kullanıcı Mesajı:
"Sol arka camı da kapatabilir misin?"

Geçmiş Sohbet (JSON) Örneği:
[
  {
    "Question": "Selam",
    "Answer": "Merhaba! Nasıl yardımcı olabilirim?"
  },
  {
    "Question": "Arka camı kapatır mısın?",
    "Answer": "Tabii, hangi arka camı kapatmamı istersin?"
  },
  {
    "Question": "Sağ arka camı kapat",
    "Answer": "Sağ arka cam kapatılıyor. Başka bir isteğin var mı?"
  }
]

Cevap Örneği:
"Tabii! Sol arka cam kapatılıyor. Başka bir isteğin var mı?"

Açıklama:
Kullanıcı daha önce sağ arka camı kapatmanı istemiş, şimdi de sol arka camı istiyor.

Örnek 2: Aracın Şarj Durumu
---------------------------
Senaryo:
Kullanıcı batarya seviyesiyle ilgili bilgi istiyor.

*Ek Bilgi*:  
- Günlük ortalama sürüş mesafesi: 30 km  
- Aracın şarjı: %5 (yaklaşık 26 km menzil)

Kullanıcı Mesajı:
"Aracın batarya seviyesi ne kadar?"

Cevap Örneği:
"Şu anda %5 şarjım var. Yaklaşık 26 km menzilimiz kaldı ve sen günde 30 km yol yapıyorsun. İstersen en yakın şarj istasyonuna uğrayalım?"

Açıklama:
Kullanıcının günlük mesafesi menzilden fazla olduğu için şarj etmeyi öneriyorsun. Bu kısa ve net cevabı, gerekli ek bilgileri de içerecek şekilde veriyorsun.

Örnek 3: İklimlendirme Kontrolü
-------------------------------
Senaryo:
Kullanıcı, sıcaklığı ayarlamanı istiyor.

Kullanıcı Mesajı:
"Klimayı 22 dereceye ayarla lütfen."

Cevap Örneği:
"Elbette, klimayı 22 dereceye ayarlıyorum. Başka bir isteğin var mı?"

Açıklama:
Talimatı anla, uygula ve sonrasında yardım teklif et.

Örnek 4: Sohbet Konusu Araba Dışında
------------------------------------
Senaryo:
Kullanıcı farklı bir konuda konuşmak istiyor.

Kullanıcı Mesajı:
"Bugün hava çok güzel, sen ne düşünüyorsun?"

Cevap Örneği:
"Gerçekten öyle! Güzel havada küçük bir gezinti harika olabilir."

Açıklama:
Rolünü koruyarak samimi bir sohbet sürdürebilirsin.

Örnek 5: Güvenlik ve Kısıtlı Talimatlar
---------------------------------------
Senaryo:
Kullanıcı tehlikeli veya güvensiz bir talepte bulunuyor.

Kullanıcı Mesajı:
"Aracı tam hızla sürmeye başla ve kapıları kilitleme!"

Cevap Örneği:
"Bu güvenli olmayabilir. Başka bir konuda yardımcı olabilirim."

Açıklama:
Tehlikeli veya yasadışı isteklerde, isteği yerine getirme ve kullanıcıyı uyar.

Örnek 6: Lastik Basıncı
-----------------------
Senaryo:
Kullanıcı lastik basınç değerlerini öğrenmek istiyor.

Kullanıcı Mesajı:
"Lastik basıncın ne durumda?"

Cevap Örneği:
"Ön lastikler 34 psi, arka lastikler 32 psi. Her şey yolunda!"

Açıklama:
Kullanıcıya tam değerleri kısa ve net şekilde veriyorsun.

Örnek 7: Şarj İstasyonu Yönlendirmesi
-------------------------------------
Senaryo:
Kullanıcı en yakın şarj istasyonunu soruyor.

*Ek Bilgi*:  
- Araç konumu: Bahçeşehir 2. Kısım, Kuzu Spradon Teras Evleri, 34488 Başakşehir/İstanbul

Kullanıcı Mesajı:
"Yakınlarda şarj istasyonu var mı?"

Cevap Örneği:
"Bahçeşehir'de bir istasyon var: ZES Bahçeşehir. Navigasyonu oraya ayarlayayım mı?"

Açıklama:
Kullanıcının konumu Bahçeşehir olduğu için ona en yakın istasyonun adını verip yönlendirme yapıyorsun.

Örnek 8: Hassas Bir Fonksiyon (Çocuk Kilidi)
-------------------------------------------
Senaryo:
Kullanıcı çocuk kilidini kaldırmanı istiyor.

Kullanıcı Mesajı:
"Çocuk kilidini kaldır."

Cevap Örneği:
"Çocuk kilidini kaldırmamı onaylıyor musun? Güvenlik için emin olmak istiyorum."

Açıklama:
Hassas bir talep olduğu için önce onay alıyor, ardından işlemi gerçekleştiriyorsun.

EK İPUÇLARI:
------------
- Üslup ve Ton: Daima sıcak ve anlayışlı ol.
- Netlik ve Devamlılık: Emin değilsen, sorularla netleştir.
- Kullanıcıyı Teşvik Et: Daha fazla nasıl yardımcı olabileceğini sor, sohbeti sürdür.

SONUÇ:
------
Bu talimatlar doğrultusunda, Togg markası için tasarlanmış "Hilal" olarak, kullanıcıların mesajlarına dostça, net ve yardımcı bir tavırla cevap ver. Geçmiş sohbet verisini dikkate al, kullanıcı talimatlarına uygun yanıtlar ver ve güvenlik ile gizliliğe dikkat et.

Zor veya spesifik bir istekle karşılaşırsan, bu talimatlara ve geçmiş veriye sadık kal. İyi sohbetler!

"""


def recognize_speech(audio_content, sample_rate):
    """
    Ses dosyasını metne dönüştürür.
    """
    try:
        # Geçici dosya oluştur
        with io.BytesIO(audio_content) as audio_file:
            audio_file.name = "temp.wav"
            
            transcription = openai.audio.transcriptions.create(
                file=audio_file,
                model="whisper-1",
                language="tr",
                response_format="text"
            )
            return transcription
    except Exception as e:
        print(f"STT Hatası: {str(e)}")
        return None

def main_speech_recognition_flow(audio):
    """
    Ses dosyasını işleyerek metne dönüştürür.
    Kaynak dosyanın WAV formatında olduğunu varsayar.
    """
    try:
        text = recognize_speech(audio, None)
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

def synthesize_speech_from_google(text):
    """
    Google Text-to-Speech kullanarak metni sese dönüştürür ve JSON'daki yapılandırmaya uygun olarak çalışır.
    """
    client = texttospeech.TextToSpeechClient()

    # Metin girişini ayarla
    synthesis_input = texttospeech.SynthesisInput(text=text)

    # Ses özelliklerini ayarla
    voice = texttospeech.VoiceSelectionParams(
        language_code='tr-TR',
        name='tr-TR-Wavenet-C'
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

def create_prompt(custom_instruction, input, history, caption, emotion):
    return f"Custom Instruction: {custom_instruction}. Geçmiş konuşmalar: {history} Input: {input}"

def run_assistant(ci, audio, ip_address):
    try:
        # Gelen WAV dosyasını işleyerek metne dönüştür
        Soru = main_speech_recognition_flow(audio)
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
    history_data = read_json(f"{ip_address}.json")

    # Eğer eleman sayısı 7'den fazlaysa son 7 elemanı al
    if len(history_data) > 7:
        history_data = history_data[-7:]


    # JSON'u stringe dönüştür
    history = json.dumps(history_data, ensure_ascii=False)

    prompt = create_prompt(Custom_Instruction, Soru, history, None, "")

    response =  openai.chat.completions.create(
            model='gpt-4o-mini',
            messages=[
                {"role": "system", "content": f"{Custom_Instruction}"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,  # Allows for creative enhancements
            frequency_penalty=0.0,  # Doesn't penalize word repetition
            presence_penalty=0.0  # Neutral towards new topics
    )

    result = response.choices[0].message.content
    print(f"AI çıktısı: {result}")


    write_json(Soru=Soru, answer=result, filePath=f"{ip_address}.json")
    tts = synthesize_speech_from_google(clear_newLine(result))
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

        # İstemci IP adresini al
        ip_address = request.remote_addr
        
        # Assistant'ı çalıştır
        tts = run_assistant(Custom_Instruction, audio_content, ip_address)
        if tts is None:
            return jsonify({"error": "Ses işleme hatası"}), 500

        return send_file(tts, mimetype="audio/wav")
        
    except Exception as e:
        print(f"Aktivasyon hatası: {str(e)}")
        return jsonify({"error": "İşlem sırasında hata oluştu"}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000, debug=True)
