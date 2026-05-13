import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from config import settings

def send_verification_email(email: str, code: str):
    # Check if email configuration is complete
    if not all([settings.SMTP_SERVER, settings.SMTP_PORT, settings.SMTP_USER, settings.SMTP_PASSWORD]):
        print(f"Email configuration incomplete. Skipping email to {email}")
        print(f"Verification code for {email}: {code}")
        return

    msg = MIMEMultipart()
    msg['From'] = settings.EMAIL_FROM
    msg['To'] = email
    msg['Subject'] = "Tu código de verificación de Versiona"

    body = f"""
    Hola,

    Gracias por registrarte en Versiona. Tu código de verificación es:

    {code}

    Este código expirará en 15 minutos.

    Si no has solicitado este correo, puedes ignorarlo.
    """
    msg.attach(MIMEText(body, 'plain'))

    try:
        with smtplib.SMTP(settings.SMTP_SERVER, settings.SMTP_PORT) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)
            print(f"Email sent successfully to {email}")
    except Exception as e:
        print(f"Error sending email to {email}: {e}")

