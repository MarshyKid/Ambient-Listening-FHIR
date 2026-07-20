# **SecureDockerFHIR – Training with FHIR using InterSystems IRIS for Health Community Edition**
# ** This is a secure version of DockerFHIR that enables SSL/TLS and employs a web gateway
# ** Necessary for making OAuth Requests

This repository provides a **Docker-based environment** for training with **FHIR (Fast Healthcare Interoperability Resources)** using **InterSystems IRIS for Health Community Edition**.

By the end of this lab, you will have a fully functional environment for **FHIR-based application development**, including:
- A **Dockerized IRIS for Health** instance with FHIR support.
- Pre-configured **FHIR datasets**.
- A **VS Code development environment** with essential extensions.
- Integrated **REST client tools** for testing FHIR APIs.

---

## **Prerequisites**
Before proceeding, ensure you have the following installed:

1. **Docker Desktop**  
   - Download and install from: [https://www.docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop)
   - Verify installation with:  
     ```sh
     docker --version
     ```

2. **Visual Studio Code (VS Code)**
   - Install from: [https://code.visualstudio.com/](https://code.visualstudio.com/)
   - Recommended Extensions:
     - **REST Client** (for API testing)
     - **Docker** (for container management)
     - **Python** (if using Python for FHIR clients)

---

## **Getting Started**

### **Step 1: Clone the Repository**
First, clone this repository to your local machine:
```sh
git clone https://github.com/pjamiesointersystems/Dockerfhir.git
cd Dockerfhir
```

---

### **Step 2: Pull the IRIS for Health Community Image**
Before building, ensure you have the latest **InterSystems IRIS for Health Community Edition** image:
```sh
docker pull containers.intersystems.com/intersystems/irishealth-community:latest-em
```

---

### **Step 3: Build the Docker Container**
To build the container from the **Dockerfile** in this repository, run:
```sh
docker-compose build
```

🔹 **What this does:**
- Creates a **FHIR-enabled IRIS for Health** container.
- Copies **FHIR resources** and **scripts** for automated setup.
- Configures **CORS** for FHIR API accessibility.

---

### **Step 4: Run the IRIS for Health Container**
Once built, start the container with:
```sh
docker-compose up -d
```
🔹 This starts the container **in detached mode (`-d`)**, meaning it runs in the background.

---

### **Step 5: Verify That IRIS is Running**
Check running containers:
```sh
docker ps
```
You should see a container named **iris-fhir** running.

If the container fails to start, check the logs:
```sh
docker logs iris-fhir
```

---

## **Accessing the FHIR Server and IRIS Management Portal**

### **1. Access the IRIS Management Portal**
Open your browser and go to:
👉 **[http://localhost:8080/csp/sys/UtilHome.csp](http://localhost:8080/csp/sys/UtilHome.csp)**  
**Login Credentials:**
- **Username:** `_SYSTEM`
- **Password:** `ISCDEMO`

### **2. Access the FHIR API**
Test the **FHIR endpoint** by opening:
👉 **[http://localhost:8080/csp/healthshare/demo/fhir/r4/metadata](http://localhost:8080/csp/healthshare/demo/fhir/r4/metadata)**

---

## **Working with FHIR Data**
### **Sending a FHIR Request Using VS Code REST Client**
After installing the **REST Client extension** in VS Code, create a file `fhir_test.http` with:
```
GET http://localhost:8080/csp/healthshare/demo/fhir/r4/Patient
Accept: application/fhir+json
```
Then **click "Send Request"** to test the FHIR API.

---

## **Understanding the Docker Setup**
This repository contains:

### **Dockerfile**
```dockerfile
FROM intersystems/irishealth-community:latest-cd
```
🔹 Uses **InterSystems IRIS for Health Community Edition** as the base image.

---
# ** This is a secure version of DockerFHIR that enables SSL/TLS and employs a web gateway
# ** Necessary for making OAuth Requests
### **Docker Compose File (`docker-compose.yml`)**
```yaml
services:
  irisfhir:
    build: .
    container_name: irisfhir
    hostname: fhir-validator.local  # <-- Add this line
    restart: unless-stopped
    ports:
      - "1972:1972"
      - "52773:52773"
      - "7038:7038"
    volumes:
      - ./data:/data
    environment:
      ISC_DATA_DIRECTORY: /data/ifconfig
      ISC_CPF_MERGE_FILE: /merge/CMF.cpf
    entrypoint: ["/iris-main"]
    networks:
      fhir-net:  # <-- Use custom network
        aliases:
          - fhir-validator.local  # optional: for other containers
        ipv4_address: 172.1.1.40
  webserver:
    hostname: webserver
    build:
      context: ./webgateway
      dockerfile: Dockerfile
    container_name: webserver
    init: true
    depends_on:
      - irisfhir
    networks:
      fhir-net:
       ipv4_address: 172.1.1.41
        
    ports:
    - "8080:80"
    - "8443:443"
    
    
    environment:
        - IRIS_HOST=172.1.1.40
        - IRIS_PORT=1972
        - "IRIS_WEBAPPS=/csp /csp/sys /api"
networks:
  fhir-net:
    driver: bridge
    ipam:
      config:
       - subnet: 172.1.1.0/24
```
🔹 **Key Components:**
- **Port Mapping:** Exposes **IRIS Web UI** and **FHIR API** on `localhost:8080`.
- **Volume Mounting:** Maps the local `data/` directory to `/data` in the container.
- **Entrypoint:** Runs the **IRIS instance** at startup.

---

## **Stopping & Restarting the Container**
To stop the container:
```sh
docker-compose down
```

To restart:
```sh
docker-compose up -d
```

---

## **Troubleshooting**
| Issue | Solution |
|--------|---------|
| **Container fails to start** | Run `docker logs iris-fhir` to check errors. |
| **Can't access FHIR API** | Ensure the container is running: `docker ps` |
| **Changes to the Dockerfile aren't applying** | Run `docker-compose up --build -d` to rebuild and restart. |

---

## **Next Steps**
✅ **Test the FHIR API with VS Code REST Client.**  
✅ **Develop Python-based FHIR clients using Jupyter Notebooks.**  
✅ **Explore healthcare data modeling and interoperability with IRIS for Health.**  

🚀 **Happy Coding!** 🚀

