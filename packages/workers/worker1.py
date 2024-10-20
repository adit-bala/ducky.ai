import pika
import os
import json
from dotenv import load_dotenv
import time
import redis
from hume import HumeClient
from openai import OpenAI



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
HUME_API_KEY = os.getenv('HUME_API_KEY')

OPENAI_CLIENT = OpenAI(
  api_key=OPEN_API_KEY,
  organization=ORGANIZATION_ID,
  project=PROJECT_ID,
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

def redis_presentation_exists(pres_id):
    return re.hget(pres_id, 'thread_id') != None

def redis_create_presentation(pres_id, thread_id):
    re.hset(pres_id, 'next', 0)
    re.hset(pres_id, 'thread_id', thread_id)
    re.hset(pres_id, 'pending', json.dumps({}))

def redis_add_gpt_job(pres_id, user_id, clip_id, transcript, slide_url, is_end):
    data = {
        'USER_ID': user_id,
        'TRANSCRIPT': transcript,
        'SLIDE_URL': slide_url,
        'PRESENTATION_ID': pres_id,
        'CLIP_ID': clip_id,
        'IS_END': is_end
    }
    re.hset(pres_id, clip_id, json.dumps(data))

def create_thread():
    thread = OPENAI_CLIENT.beta.threads.create()
    return thread.id

def get_transcript(video_url):
    hclient = HumeClient(
        api_key=HUME_API_KEY,
    )

    video_job = hclient.expression_measurement.batch.start_inference_job(
        urls=[video_url],
        notify=True,
    )

    while hclient.expression_measurement.batch.get_job_details(id=video_job).state.status != "COMPLETED":
        time.sleep(1.5)
        print(hclient.expression_measurement.batch.get_job_details(id=video_job).state.status)

    video_resp = hclient.expression_measurement.batch.get_job_predictions(
        id=video_job,
    )

    result = {'Transcript':'', 'Emotions':{}}
    try:
        for i in range(len(video_resp[0].results.predictions[0].models.language.grouped_predictions[0].predictions)):
            result['Transcript'] +=  video_resp[0].results.predictions[0].models.language.grouped_predictions[0].predictions[i].text + " "
        result['Transcript'] = result['Transcript'].strip()
    except Exception as e:
        print("Hume transcription failed, returning empty transcript.")

    '''for i in range(len(video_resp[0].results.predictions[0].models.prosody.grouped_predictions[0].predictions[0].emotions)):
        emot = video_resp[0].results.predictions[0].models.prosody.grouped_predictions[0].predictions[0].emotions[i]
        result['Emotions'][emot.name] = emot.score'''
    return result

def process_hume_job(job_params):

    result = get_transcript(job_params['audioURL'])

    user_id = job_params["userID"]
    pres_id = job_params["presentationID"]

    if not redis_presentation_exists(pres_id):
        thread_id = create_thread()
        redis_create_presentation(pres_id, thread_id)
    
    redis_add_gpt_job(pres_id, job_params["userID"], job_params["clipIndex"], result['Transcript'], job_params['slideURL'], job_params['isEnd'])

    return {'PRESENTATION_ID':pres_id, 'CLIP_ID': job_params["clipIndex"]}

def process_message(body):
    message = body.decode()
    print(f" [x] Worker1 received: {message}")
    # TODO: Add your processing logic here
    job_params = process_hume_job(json.loads(message))
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

if __name__ == "__main__":
    start_worker()