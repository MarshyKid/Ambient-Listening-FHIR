FROM containers.intersystems.com/intersystems/webgateway:2025.1

RUN apt update -y
RUN apt install nano -y 
RUN apt install apache2-utils -y
USER root

COPY apache2.conf /etc/apache2/apache2.conf
COPY default-ssl.conf /etc/apache2/sites-available/default-ssl.conf
COPY ./CSP.ini  /opt/webgateway/bin/CSP.ini

WORKDIR /etc/apache2/sites-enabled
RUN ln -s ../sites-available/default-ssl.conf default-ssl.conf

# ssl certificate
WORKDIR /etc/ssl
COPY ./ssl/intersystems.crt /etc/ssl/certs/ssl-cert.crt
COPY ./ssl/intersystems.key /etc/ssl/private/ssl-cert.key
RUN a2enmod ssl && a2enmod rewrite && a2enmod headers && a2ensite default-ssl.conf