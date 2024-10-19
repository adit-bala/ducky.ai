#!/usr/bin/env python3

import sys
import requests
import json
import urllib.parse

def create_queue(host, user, password, vhost, queue_name):
    vhost_encoded = urllib.parse.quote(vhost, safe='')
    url = f"https://{host}/api/queues/{vhost_encoded}/{queue_name}"
    headers = {'Content-Type': 'application/json'}
    data = {"durable": True}

    response = requests.put(
        url,
        auth=(user, password),
        headers=headers,
        data=json.dumps(data)
    )

    if response.status_code in [201, 204]:
        print(f"Queue '{queue_name}' created or already exists.")
    else:
        print(f"Failed to create queue '{queue_name}': {response.text}")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) != 6:
        print("Usage: create_queues.py <host> <user> <password> <vhost> <queue_name>")
        sys.exit(1)

    host = sys.argv[1]
    user = sys.argv[2]
    password = sys.argv[3]
    vhost = sys.argv[4]
    queue_name = sys.argv[5]

    create_queue(host, user, password, vhost, queue_name)