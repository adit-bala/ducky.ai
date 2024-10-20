workspace {
    
    !identifiers hierarchical

    model {
        // People
        user = person "User" "A user of the presentation system"

        // External Software Systems
        googleOAuth = softwareSystem "Google OAuth" "Authentication provider"  {
            tags "External System"
        }

        awsS3 = softwareSystem "AWS S3" "File storage service" {
            tags "External System"
        }

        cloudAmqp = softwareSystem "CloudAMQP" "RabbitMQ as a Service"  {
            tags "External System"
        }

        pulumi = softwareSystem "Pulumi" "Manages infrastructure as code" {
            tags "External System"
        }

        // Software System
        presentationSystem = softwareSystem "Presentation Creation System" "Allows users to create and manage presentations" {
            // Frontend Containers
            frontend = container "Frontend Application" "Provides the user interface" "React (TypeScript), Vite"

            reverseProxy = container "Reverse Proxy" "Routes requests to appropriate services" "Nginx"

            // Backend Containers
            backend = container "Backend API Server" "Handles business logic and API requests" "Deno"

            workers = container "Worker Processes" "Processes tasks like PDF processing, transcription, and AI analysis" "Python"

            database = container "Database" "Stores application data" "MongoDB"

            messageQueue = container "Message Queue" "Distributes tasks to workers" "RabbitMQ"

            cache = container "Cache" "Stores temporary data" "Redis"

            awsLambda = container "AWS Lambda Functions" "Handles serverless functionalities" "AWS Lambda"

            fileStorage = container "File Storage" "Stores uploaded files" "AWS S3"
        }

        // Relationships
        user -> presentationSystem.reverseProxy "Accesses via browser"

        presentationSystem.reverseProxy -> presentationSystem.frontend "Serves frontend application"

        presentationSystem.frontend -> presentationSystem.reverseProxy "Sends API requests via"

        presentationSystem.reverseProxy -> presentationSystem.backend "Forwards API requests to"

        presentationSystem.frontend -> awsS3 "Uploads files to"

        presentationSystem.backend -> googleOAuth "Uses for authentication"

        presentationSystem.backend -> presentationSystem.database "Reads from and writes to"

        presentationSystem.backend -> presentationSystem.messageQueue "Publishes tasks to"

        presentationSystem.backend -> presentationSystem.cache "Uses for temporary data storage"

        presentationSystem.backend -> presentationSystem.fileStorage "Uploads files to and downloads files from"

        presentationSystem.backend -> presentationSystem.awsLambda "Invokes for serverless functionality"

        presentationSystem.workers -> presentationSystem.messageQueue "Consumes tasks from"

        presentationSystem.workers -> presentationSystem.database "Reads from and writes to"

        presentationSystem.workers -> presentationSystem.fileStorage "Reads from and writes to"

        presentationSystem.workers -> presentationSystem.cache "Uses for temporary data storage"

        presentationSystem.messageQueue -> cloudAmqp "Hosted by"

        presentationSystem.fileStorage -> awsS3 "Hosted by"

        presentationSystem -> pulumi "Infrastructure managed via"
    }

    views {
        container presentationSystem "Containers_All" {
            include *
            include awsS3
            include googleOAuth
            include cloudAmqp
            include pulumi
            autolayout lr
        }

        // Additional container views can be defined similarly if needed
        /*
        containerView presentationSystem "Containers_Workers" {
            include presentationSystem.workers
            autolayout lr
        }
        */

        styles {
            element "Person" {
                shape Person
                background "#08427b"
                color "#ffffff"
            }
            element "Frontend Application" {
                shape WebBrowser
                background "#85BBF0"
            }
            element "Reverse Proxy" {
                shape Component
                background "#85BBF0"
            }
            element "Backend API Server" {
                shape Hexagon
                background "#85BBF0"
            }
            element "Worker Processes" {
                shape Robot
                background "#F1C232"
            }
            element "Database" {
                shape Cylinder
                background "#B0C4DE"
            }
            element "Message Queue" {
                shape Pipe
                background "#B0C4DE"
            }
            element "Cache" {
                shape Cylinder
                background "#B0C4DE"
            }
            element "AWS Lambda Functions" {
                shape Ellipse
                background "#F1C232"
            }
            element "File Storage" {
                shape Folder
                background "#B0C4DE"
            }
            element "Google OAuth" {
                shape Circle
                background "#E0E0E0"
                border dashed
            }
            element "AWS S3" {
                shape Circle
                background "#E0E0E0"
                border dashed
            }
            element "CloudAMQP" {
                shape Circle
                background "#E0E0E0"
                border dashed
            }
            element "Pulumi" {
                shape Circle
                background "#E0E0E0"
                border dashed
            }
        }
    }
}