import pika
import os
import json
from dotenv import load_dotenv
import time
import redis
from openai import OpenAI
from deepgram import DeepgramClient, PrerecordedOptions
import asyncio
from pymongo import MongoClient



load_dotenv()

RABBITMQ_URL = os.getenv("RABBITMQ_URI")
QUEUE_NAME = os.getenv("FIRST_QUEUE", "default_queue")
QUEUE_NAME_TWO = "LLM"
ORGANIZATION_ID = os.getenv("OPENAI_ORGANIZATION")
PROJECT_ID = os.getenv("OPENAI_PROJECT")
REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.getenv('REDIS_PORT', 6379))
REDIS_PASSWORD = os.getenv('REDIS_PASSWORD', '')
OPEN_API_KEY= os.getenv("OPEN_API_KEY")
HUME_API_KEY=os.getenv("HUME_API_KEY")
DEEPGRAM_API_KEY= os.getenv("DEEPGRAM_API_KEY")
MONGO_URI = os.getenv("MONGO_URI")
MONGO_DB = os.getenv("MONGO_DB")

mongo_client = MongoClient(MONGO_URI)
database = mongo_client[MONGO_DB]


OPENAI_CLIENT = OpenAI(
  api_key=OPEN_API_KEY,
  organization=ORGANIZATION_ID,
  project=PROJECT_ID,
)

HUME_CLIENT = HumeClient(
    api_key=HUME_API_KEY,
)

re = redis.Redis(
    host=REDIS_HOST,
    port=REDIS_PORT,
    password=REDIS_PASSWORD,
    decode_responses=True
)
if not RABBITMQ_URL:
    print("RABBITMQ_URL is not defined in the environment variables.")
    exit(1)

deepgram_api_key = os.getenv("DEEPGRAM_API_KEY")
deepgram = DeepgramClient(deepgram_api_key)

def redis_presentation_exists(pres_id):
    return re.hget(pres_id, 'thread_id') != None

def redis_create_presentation(pres_id, thread_id):
    re.hset(pres_id, 'next', 0)
    re.hset(pres_id, 'thread_id', thread_id)
    re.hset(pres_id, 'pending', json.dumps({}))

def redis_add_gpt_job(pres_id, user_id, clip_id, transcript, slide_url, video_url, is_end, emotion, score):
    data = {
        'USER_ID': user_id,
        'TRANSCRIPT': transcript,
        'SLIDE_URL': slide_url,
        'VIDEO_URL': video_url,
        'PRESENTATION_ID': pres_id,
        'CLIP_ID': clip_id,
        'IS_END': is_end,
        'EMOTIONS': emotion,
        'SCORE': score
    }
    re.hset(pres_id, clip_id, json.dumps(data))

def create_thread(user_id, pres_id):
    collection = database["users"]
    
    # Find the user with the given user_id and the presentation with the given pres_id
    result = collection.find_one(
        {'googleId': user_id, 'presentations._id': pres_id},
        {'presentations.$': 1}
    )

    if not result or 'presentations' not in result or len(result['presentations']) == 0:
        print(f"No presentation found for user_id: {user_id}, pres_id: {pres_id}")
        return None  # Or handle as appropriate

    preset = result['presentations'][0].get('preset', {})
    
    # Validate preset fields
    presentation_description = preset.get('presentationDescription') or "None"
    audience_description = preset.get('audienceDescription') or "None"
    tone_description = preset.get('toneDescription') or "None"

    # Construct the initial message
    initial_message = (
        f"This presentation is about: {presentation_description}. "
        f"The audience is: {audience_description}. "
        f"The tone should be: {tone_description}."
    )
    
    # Create a new OpenAI thread
    try:
        thread = OPENAI_CLIENT.beta.threads.create()
    except Exception as e:
        print(f"Failed to create OpenAI thread: {e}")
        return None  # Or handle as appropriate
    
    # Structure the content as a list of message objects
    content = [{"type": "text", "text": initial_message}]
    
    # Send the initial message to the OpenAI thread
    try:
        OPENAI_CLIENT.beta.threads.messages.create(
            thread_id=thread.id,
            role="user",
            content=content
        )
    except Exception as e:
        print(f"Failed to send initial message to OpenAI thread: {e}")
        return None  # Or handle as appropriate
    
    return thread.id

def get_transcript(audio_url):

    # Define the transcription options
    options: PrerecordedOptions = PrerecordedOptions(
        model="nova-2",
        smart_format=True,
    )

    audio_source = {"url": audio_url}    
    response = deepgram.listen.rest.v("1").transcribe_url(audio_source, options, timeout=300)
    transcript = response['results']['channels'][0]['alternatives'][0]['transcript']

    return transcript

def get_emotions(audio_url):
    audio_job = HUME_CLIENT.expression_measurement.batch.start_inference_job(
        urls=[audio_url],
        notify=True,
    )

    while HUME_CLIENT.expression_measurement.batch.get_job_details(id=audio_job).state.status != "COMPLETED":
        time.sleep(1.5)
        print(HUME_CLIENT.expression_measurement.batch.get_job_details(id=audio_job).state.status)

    audio_resp = HUME_CLIENT.expression_measurement.batch.get_job_predictions(
        id=audio_job,
    )

    emot_list = []
    result = {}
    try:
        for i in range(len(audio_resp[0].results.predictions[0].models.prosody.grouped_predictions[0].predictions[0].emotions)):
            emot = audio_resp[0].results.predictions[0].models.prosody.grouped_predictions[0].predictions[0].emotions[i]
            result[emot.name] = emot.score
            emot_list.append({'emotion': emot.name, 'score': emot.score})
    except Exception as e:
        print(f"Failed to parse emotions: {e}.")
        return {'emotions': '', 'score': ''}
    
    emot_list.sort(key=lambda x: -x['score'])

    bad_avg = (result['Awkwardness']+result['Anxiety']+result['Confusion']+result['Doubt']+result['Embarrassment']+result['Fear']+result['Tiredness']) / 7.0
    good_avg = (result['Calmness'] + result['Concentration'] + result['Determination'] + result['Excitement'] + result['Interest'] + result['Joy']) / 6.0

    return {'emotions': json.dumps([x['emotion'] for x in emot_list[:3]]), 'score': str(good_avg - bad_avg)}



def process_transcription_job(job_params):
    result = get_transcript(job_params['audioURL'])
    emot = get_emotions(job_params['audioURL'])

    user_id = job_params["userID"]
    pres_id = job_params["presentationID"]

    if not redis_presentation_exists(pres_id):
        thread_id = create_thread(user_id, pres_id)
        redis_create_presentation(pres_id, thread_id)
    
    redis_add_gpt_job(
        pres_id, 
        user_id, 
        job_params["clipIndex"], 
        result, 
        job_params['slideURL'],
        job_params['videoURL'],
        job_params['isEnd'],
        emot['emotions'],
        emot['score']
    )

    return {'PRESENTATION_ID': pres_id, 'CLIP_ID': job_params["clipIndex"]}

def process_message(body):
    message = body.decode()
    print(f" [x] Worker1 received: {message}")
    # TODO: Add your processing logic here
    job_params = process_transcription_job(json.loads(message))
    # Pass presentation id, clip id to queue 2
    
    params = pika.URLParameters(RABBITMQ_URL)
    connection = pika.BlockingConnection(params)
    channel = connection.channel()
    channel.queue_declare(queue=QUEUE_NAME_TWO, durable=True)
    channel.basic_publish(exchange='', routing_key=QUEUE_NAME_TWO, body=json.dumps(job_params),properties=pika.BasicProperties(delivery_mode=pika.DeliveryMode.Persistent))
    connection.close()

def callback(ch, method, properties, body):
    try:
        process_message(body)
        ch.basic_ack(delivery_tag=method.delivery_tag)
    except Exception as e:
        print(f"Error processing message: {e}")
        # Optionally, send to a dead-letter queue or retry

def start_worker():
    while True:
        try:
            params = pika.URLParameters(RABBITMQ_URL)
            connection = pika.BlockingConnection(params)
            channel = connection.channel()
            channel.queue_declare(queue=QUEUE_NAME, durable=True)
            print(f" [*] Worker1 waiting for messages in {QUEUE_NAME}. To exit press CTRL+C")
            channel.basic_qos(prefetch_count=1)
            # calls callback when we get the message
            channel.basic_consume(queue=QUEUE_NAME, on_message_callback=callback)
            channel.start_consuming()
        except pika.exceptions.AMQPConnectionError as e:
            print(f"Connection error: {e}. Retrying in 5 seconds...")
            time.sleep(5)
        except KeyboardInterrupt:
            print("Worker1 stopped.")
            break
        except Exception as e:
            print(f"Unexpected error: {e}. Retrying in 5 seconds...")
            time.sleep(5)

start_worker()