#!/usr/bin/env node
/**
 * Script per creare Price ID di test reali su Stripe
 * Da utilizzare SOLO per configurazione test environment
 */

const stripe = require('stripe')('sk_test_51OODKjEfHcSzngQqGiPqHsQGHSKWJTPxAJFp7PKB9Xt2hgCo1YQJiqjPXUHo9hGGLRzKzpG9pRoVWLi0VxDQSRTL00ABCD1234');

async function createTestPrices() {
  try {
    console.log('🧪 Creazione Price ID di test per Memorie Sospese...\n');
    
    // Starter Plan
    const starterPrice = await stripe.prices.create({
      unit_amount: 1000, // €10.00
      currency: 'eur',
      recurring: {
        interval: 'month',
      },
      product_data: {
        name: 'Memorie Sospese - Starter',
        description: '5 gallerie, 5K foto, watermark personalizzato',
      },
      metadata: {
        plan: 'starter',
        environment: 'test'
      }
    });
    
    // Pro Plan
    const proPrice = await stripe.prices.create({
      unit_amount: 2000, // €20.00
      currency: 'eur',
      recurring: {
        interval: 'month',
      },
      product_data: {
        name: 'Memorie Sospese - Pro',
        description: 'Gallerie illimitate, 25K foto, dominio personalizzato',
      },
      metadata: {
        plan: 'pro',
        environment: 'test'
      }
    });
    
    // Premium Plan
    const premiumPrice = await stripe.prices.create({
      unit_amount: 4000, // €40.00
      currency: 'eur',
      recurring: {
        interval: 'month',
      },
      product_data: {
        name: 'Memorie Sospese - Premium',
        description: 'Tutto incluso + download ZIP + storage illimitato',
      },
      metadata: {
        plan: 'premium',
        environment: 'test'
      }
    });
    
    console.log('✅ Price ID di test creati con successo:');
    console.log(`📦 Starter:  ${starterPrice.id}`);
    console.log(`🚀 Pro:      ${proPrice.id}`);
    console.log(`💎 Premium:  ${premiumPrice.id}`);
    
    console.log('\n📝 Aggiorna shared/subscription-schema.ts con questi ID:');
    console.log(`starter priceId: '${starterPrice.id}'`);
    console.log(`pro priceId: '${proPrice.id}'`);
    console.log(`premium priceId: '${premiumPrice.id}'`);
    
  } catch (error) {
    console.error('❌ Errore creazione Price ID:', error.message);
  }
}

createTestPrices();