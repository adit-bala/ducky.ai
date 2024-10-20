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
QUEUE_NAME = os.getenv("SECOND_QUEUE", "default_queue")

OPEN_API_KEY = os.getenv("OPEN_API_KEY")
ORGANIZATION_ID = os.getenv("OPENAI_ORGANIZATION")
PROJECT_ID = os.getenv("OPENAI_PROJECT")
ASSISTANT_ID = os.getenv("ASSISTANT_ID")
REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.getenv('REDIS_PORT', 6379))
REDIS_PASSWORD = os.getenv('REDIS_PASSWORD', '')
OPEN_API_KEY= os.getenv("OPEN_API_KEY")
MONGO_URI = os.getenv("MONGO_URI")
MONGO_DB = os.getenv("MONGO_DB")

if not RABBITMQ_URL:
    print("RABBITMQ_URL is not defined in the environment variables.")
    exit(1)

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

ASSISTANT_ID=os.getenv('ASSISTANT_ID')

def redis_get_next(pres_id):
    return int(re.hget(pres_id, 'next'))

def redis_add_pending_clip(pres_id, clip_id):
    pending = json.loads(re.hget(pres_id, 'pending'))
    pending[clip_id] = 1
    re.hset(pres_id, 'pending', json.dumps(pending))

def redis_get_job_data(pres_id, clip_id):
    return json.loads(re.hget(pres_id, clip_id))

def redis_get_slideurl(pres_id, clip_id): 
    d = redis_get_job_data(pres_id, clip_id)
    return d['SLIDE_URL']

def redis_get_transcript(pres_id, clip_id): 
    d = redis_get_job_data(pres_id, clip_id)
    return d['TRANSCRIPT']

def redis_get_threadid(pres_id):
    return re.hget(pres_id, 'thread_id')

def redis_get_final_status(pres_id, clip_id):
    d = redis_get_job_data(pres_id, clip_id)
    return d['IS_END']

def redis_get_userid(pres_id, clip_id):
    d = redis_get_job_data(pres_id, clip_id)
    return d['USER_ID']

def get_clip_feedback(index, slide, transcript, assistant_id, thread_id):
  '''
  Generate prompt
  Add prompt + slide to thread
  Send thread to assistant
  Return feedback
  '''
  text_input = "Transcript " + str(index) + ": " + transcript + "\nNow evaluate this segment according the criteria given earlier."
  content = [{"type":"text", "text": text_input}, {"type":"image_url", "image_url": {"url":slide}}]
  msg = OPENAI_CLIENT.beta.threads.messages.create(
    thread_id,
    role="user",
    content=content
  )
  thread_messages = OPENAI_CLIENT.beta.threads.messages.list(thread_id)
  msg_sz = len(thread_messages.data)
  run = OPENAI_CLIENT.beta.threads.runs.create(
    thread_id=thread_id,
    assistant_id=assistant_id
  )

  while run.status != "completed":
    print(run.status)
    time.sleep(1.5)
    run = OPENAI_CLIENT.beta.threads.runs.retrieve(thread_id=thread_id, run_id=run.id)

  thread_messages = OPENAI_CLIENT.beta.threads.messages.list(thread_id)

  return thread_messages.data[0].content[0].text.value

def get_overall_critic(assistant_id, thread_id):
    text_input = "Now evaluate the whole presentation on the following criteria:\n\t- Overall narrative flow\n\t- Were there enough images or graphics to break up monotony of text\n\t- How all the segments work together for goal of the overall presentation"
    content = [{"type":"text", "text": text_input}]
    msg = OPENAI_CLIENT.beta.threads.messages.create(
        thread_id,
        role="user",
        content=content
    )
    thread_messages = OPENAI_CLIENT.beta.threads.messages.list(thread_id)
    msg_sz = len(thread_messages.data)
    run = OPENAI_CLIENT.beta.threads.runs.create(
        thread_id=thread_id,
        assistant_id=assistant_id
    )

    while run.status != "completed":
        print(run.status)
        time.sleep(1.5)
        run = OPENAI_CLIENT.beta.threads.runs.retrieve(thread_id=thread_id, run_id=run.id)

    thread_messages = OPENAI_CLIENT.beta.threads.messages.list(thread_id)

    return thread_messages.data[0].content[0].text.value

def get_final_summary(assistant_id, thread_id):
    text_input = "Summarize all your previous feedback in one or two paragraphs. Include the most important suggestions for improvement."
    content = [{"type":"text", "text": text_input}]
    msg = OPENAI_CLIENT.beta.threads.messages.create(
        thread_id,
        role="user",
        content=content
    )
    thread_messages = OPENAI_CLIENT.beta.threads.messages.list(thread_id)
    msg_sz = len(thread_messages.data)
    run = OPENAI_CLIENT.beta.threads.runs.create(
        thread_id=thread_id,
        assistant_id=assistant_id
    )

    while run.status != "completed":
        print(run.status)
        time.sleep(1.5)
        run = OPENAI_CLIENT.beta.threads.runs.retrieve(thread_id=thread_id, run_id=run.id)

    thread_messages = OPENAI_CLIENT.beta.threads.messages.list(thread_id)

    return thread_messages.data[0].content[0].text.value


def process_gpt_job(job_params):
    clip_id = job_params['CLIP_ID']
    pres_id = job_params['PRESENTATION_ID']
    slide_url = redis_get_slideurl(pres_id, clip_id)
    transcript = redis_get_transcript(pres_id, clip_id)
    thread_id = redis_get_threadid(pres_id)
    feedback = get_clip_feedback(clip_id, slide_url, transcript, ASSISTANT_ID, thread_id)

    if redis_get_final_status(pres_id, clip_id) != "false":
        overall = get_overall_critic(ASSISTANT_ID, thread_id)
        summary = get_final_summary(ASSISTANT_ID, thread_id)
        tot_sum = overall + "\n\n" + summary
        #update_db(redis_get_userid(pres_id, clip_id), pres_id, int(clip_id) + 1, tot_sum)

    print(clip_id)
    print(feedback)

    #update_db(redis_get_userid(pres_id, clip_id), pres_id, clip_id, feedback)
    #if redis_get_final_status(pres_id, clip_id) != "false":
    #    update_db_done(redis_get_userid(pres_id, clip_id), pres_id)

    return feedback

def removePendingClip(pres_id, clip_id):
    res = getPendingDict(pres_id)
    if clip_id in res:
        res.pop(str(clip_id))
        setPendingDict(pres_id, res)

def addPendingClip(pres_id, clip_id):
    pending_dict = getPendingDict(pres_id)
    pending_dict[clip_id] = 1
    setPendingDict(pres_id, pending_dict)

def getPendingDict(pres_id):
    res = re.hget(pres_id, 'pending')
    if res == None:
        return {}
    return json.loads(res)

def setPendingDict(pres_id, pending_dict):
    re.hset(pres_id, 'pending', json.dumps(pending_dict))

def process_message(body):
    message = body.decode()
    print(f" [x] Worker1 received: {message}")
    # TODO: Add your processing logic here

    job_params = json.loads(message)
    clip_id = job_params['CLIP_ID']
    pres_id = job_params['PRESENTATION_ID']

    if clip_id == re.hget(pres_id, 'next'):
        #Process job and then all jobs in pending we can now do, if there are any
        process_gpt_job(job_params)
        nextClip = int(clip_id) + 1

        while str(nextClip) in getPendingDict(pres_id):
            #process(database[presID][nextClip])
            process_gpt_job({'PRESENTATION_ID': pres_id, 'CLIP_ID': nextClip})

            #delete database[presID][nextClip] for garbage collection
            removePendingClip(pres_id, str(nextClip))
            nextClip += 1
        
        #database[presID][”waitingFor”] = nextClip
        re.hset(pres_id, 'next', str(nextClip))

    else:
        # Add job to pending database
        #database[job.presNumber][job.clipNumber] = job
        addPendingClip(pres_id, clip_id)

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
            print(f" [*] Worker2 waiting for messages in {QUEUE_NAME}. To exit press CTRL+C")
            channel.basic_qos(prefetch_count=1)
            # calls callback when we get the message
            channel.basic_consume(queue=QUEUE_NAME, on_message_callback=callback)
            channel.start_consuming()
        except pika.exceptions.AMQPConnectionError as e:
            print(f"Connection error: {e}. Retrying in 5 seconds...")
            time.sleep(5)
        except KeyboardInterrupt:
            print("Worker2 stopped.")
            break
        except Exception as e:
            print(f"Unexpected error: {e}. Retrying in 5 seconds...")
            time.sleep(5)

if __name__ == "__main__":
    start_worker()