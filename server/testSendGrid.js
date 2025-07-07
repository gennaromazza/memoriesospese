import sgMail from '@sendgrid/mail';

async function testSendGridAPI() {
  try {
    console.log('Testing SendGrid API...');
    
    if (!process.env.SENDGRID_API_KEY) {
      throw new Error('SENDGRID_API_KEY not found');
    }
    
    console.log('API Key found, length:', process.env.SENDGRID_API_KEY.length);
    
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    
    // Test con un messaggio semplice
    const msg = {
      to: 'gennaro.mazzacane@gmail.com',
      from: process.env.EMAIL_FROM || 'test@example.com',
      subject: 'Test SendGrid - Wedding Gallery',
      text: 'Questo è un test per verificare la configurazione SendGrid.',
      html: '<p>Questo è un <strong>test</strong> per verificare la configurazione SendGrid.</p>',
    };
    
    console.log('Sending test email with:', {
      to: msg.to,
      from: msg.from,
      subject: msg.subject
    });
    
    const result = await sgMail.send(msg);
    console.log('Email sent successfully!', result[0].statusCode);
    return true;
    
  } catch (error) {
    console.error('SendGrid test failed:', error.message);
    
    if (error.response) {
      console.error('Response body:', error.response.body);
      console.error('Status code:', error.response.statusCode);
    }
    
    return false;
  }
}

testSendGridAPI();