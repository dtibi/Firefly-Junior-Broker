/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from '@google/genai';
import { KIDS_STOCKS } from './alpaca.js';

// Pre-packaged gorgeous child-friendly tutoring fallbacks for the selected stocks
const PRE_PACKAGED_TUTORIALS: Record<string, Record<number, string>> = {
  RBLX: {
    8: `Hey! Coach Firefly here! 🧚‍♀️ Think of Roblox like a giant sandbox of electronic Legos! When you buy a share of Roblox, you own a tiny block in that sandbox. If lots of children build cool games and buy Robux, the sandbox grows and your tiny block becomes more valuable! But remember, sometimes kids move on to new playgrounds, which is why stock prices go up and down like a slide!`,
    13: `Hey there! 🧚‍♀️ Roblox isn't just a gaming app; it's an entire ecosystem of creators, developers, and players. When you buy Roblox stock (RBLX), you own a piece of this platform. Roblox makes money when players buy 'Robux' to spend on custom skins or games. Its price fluctuates based on daily active users and how much money developers are earning. Think of it as investing in the future of the digital metaverse!`,
  },
  DIS: {
    8: `Welcome to the Magic Kingdom! 🏰 Buying Disney stock is like owning a tiny piece of Mickey Mouse, Elsa's ice castle, and the real-life roller coasters in Disney World! Disney makes money when families go to movies, watch Disney Channel, and buy plush toys. Since everyone loves magic, Disney has been around for a long time, making it a sturdy, reliable stock to have in your piggy bank!`,
    13: `Disney (DIS) is a massive media conglomerate. It owns theme parks, streaming services (Disney+), movie studios (Marvel, Pixar, Star Wars), and consumer merchandise. When you invest in Disney, you're buying a piece of all these revenue streams. Disney is a 'blue-chip' stock—meaning it's a long-running, stable company. However, it still fluctuates depending on box office hits, theme park attendance, and streaming subscriber counts!`,
  },
  AAPL: {
    8: `Hey! 🍎 Look around you—do you see an iPad, iPhone, or Mac computer? Apple is the company that invents these amazing toys! When you buy Apple stock, you are helping them build the next cool tech gadget. Because so many people use their phones every single day, Apple is a very strong and powerful company. It's like having a golden apple tree in your investment garden!`,
    13: `Apple (AAPL) is one of the world's largest and most profitable technology companies. Their business model relies heavily on the 'iOS ecosystem'—once someone buys an iPhone, they often buy iPads, AirPods, and pay for services like iCloud. Apple is known for its high financial stability, but investing in it means you are tracking the global tech market and people's spending habits on premium gadgets.`,
  },
};

export const AIService = {
  /**
   * Generates a personalized stock tutorial tailored to the active child's age
   */
  async getAgeAwareStockTutorial(
    profileName: string,
    age: number,
    ticker: string
  ): Promise<string> {
    const stock = KIDS_STOCKS[ticker];
    if (!stock) {
      return `I don't have information on the ticker "${ticker}". Let's check another stock!`;
    }

    const geminiKey = process.env.GEMINI_API_KEY;

    if (geminiKey && geminiKey !== 'MY_GEMINI_API_KEY') {
      try {
        const ai = new GoogleGenAI({
          apiKey: geminiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });

        const prompt = `Explain the stock "${stock.name}" (${ticker}). Their core description is: "${stock.description}".`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: prompt,
          config: {
            systemInstruction: `You are a supportive, warm, and highly engaging financial tutor for children. 
The active user is named ${profileName}, and they are exactly ${age} years old.
Explain the financial metrics, risk behaviors, or characteristics of the stock ticker ${ticker} using analogies, mental models, and vocabulary exactly mapped to a child of this age.
Keep paragraphs short (under 3 sentences per concept), avoid dry corporate jargon, and maximize visual analogies (like playground swings, piggy banks, candy stores, lego blocks).
Always sign off as "Coach Firefly 🧚‍♀️".`,
          },
        });

        if (response && response.text) {
          return response.text.trim();
        }
      } catch (err) {
        console.error('[AIService] Gemini AI content generation failed, returning high-quality local fallback:', err);
      }
    }

    // High quality local fallback based on age bracket
    const ageBracket = age <= 10 ? 8 : 13;
    const stockTutorials = PRE_PACKAGED_TUTORIALS[ticker];
    if (stockTutorials && stockTutorials[ageBracket]) {
      return stockTutorials[ageBracket];
    }

    // Default fallback generator
    return `Hey ${profileName}! Coach Firefly here! 🧚‍♀️ Let's learn about ${stock.name} (${ticker})! 
They are a great company that makes "${stock.description}". 
Since you are ${age} years old, think of buying this stock like buying a tiny slice of their giant workshop. When they build cool things and people buy them, your slice grows bigger and more valuable! 
But be patient—like planting a seed, it takes time for your investment tree to grow big and strong! Let's watch it together!`;
  },
};
