from flask import Flask, render_template, request, jsonify, Response, send_file
import threading
import assistant
import time
import os
import json

app = Flask(__name__)

clients = []
BASE_DIR = os.path.abspath(os.path.dirname(__file__))  # Flask uygulamasının kök dizini

@app.route('/')
def index():
    return render_template('index.html')



@app.route('/activate_assistant', methods=['POST'])
def activate_assistant():
    custom_instruction = request.form.get('custom_instruction')
    safety_settings = request.form.get('safety_settings')
    audio = request.files.get('audio')

    if audio:
        # Ses dosyasını işleyen bir thread başlat
        audio_content = audio.read()  # Bellekte tut

        try:
            # TTS işlemini çalıştır
            tts = assistant.run_assistant(custom_instruction, audio_content)
        except Exception as e:
            return jsonify({"error": str(e)}), 500

        # Ses dosyasını yanıt olarak döndür
        return send_file(tts, mimetype="audio/mpeg", as_attachment=False)

    return jsonify({"error": "No audio file received"}), 400



@app.route('/deactivate_felix', methods=['POST'])
def deactivate_felix():
    # Ek hata mesajı için log ekliyoruz
    return jsonify({"message": "Deactivate Felix"})

@app.route('/get_dataset', methods=['GET'])
def get_dataset():
    reminder_file_path = 'DataSet.json'
    if os.path.exists(reminder_file_path):
        with open(reminder_file_path, 'r', encoding='utf-8') as file:
            data = json.load(file)
        return jsonify(data)
    else:
        return jsonify({"error": "Reminder file not found"}), 404

@app.route('/events')
def events():
    def event_stream():
        while True:
            if clients:
                msg = "data: {}\n\n".format("Activate Felix")
                for client in clients:
                    client.put(msg)
            time.sleep(1)

    return Response(event_stream(), content_type='text/event-stream')

def notify_clients(message):
    for client in clients:
        client.put(message)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5021)
