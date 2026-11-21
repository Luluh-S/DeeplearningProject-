# Little Minds AI: Human vs. Machine 

**Little Minds AI** is an interactive digital art gallery where visitors compete against a deep learning model at classifying children's drawings from the **KIDO dataset** as **Happiness** or **Sadness**.

**Presentation**: file:///C:/Users/hp/Downloads/Little_Minds_AI_Team_CLEAN_FINAL.html#/1

🔗 ** demo:** https://little-minds-ai.wonderfulbeach-b600cf62.uaenorth.azurecontainerapps.io/
## What you can do
- **The Challenge:** Play 10 rounds against **Haya**, the AI companion. Each round shows a real child's drawing from the held-out test set. You lock in your guess, then Haya reveals the model's prediction and the original label. Human and AI are scored against the same ground truth.
- **AI Art Studio:** Upload or draw your own picture, and the model analyzes it live, showing its confidence score.
- **Behind the Scenes:** See how the model works, from preprocessing to prediction.

## The model
- **Architecture:** MobileNetV2 (transfer learning + fine-tuning) → Global Average Pooling → Dropout → Dense (sigmoid)
- **Input:** 180 × 256 RGB images
- **Output:** a sadness score `p`; `p > 0.5` → Sadness, otherwise Happiness
- **Framework:** TensorFlow 2.20 / Keras 3
- The web app uses exactly the same preprocessing as the training notebook (verified with a parity test).

## Fair play by design
- The correct label is never sent to the browser before you answer.
- Your answer is never given to the model.
- Each drawing appears once per game, and each round is balanced between both classes.

## Tech stack
| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, vanilla JavaScript (Arabic, RTL) |
| Backend | FastAPI (Python) |
| Model | TensorFlow / Keras (`final_model.keras`) |
| Deployment | Docker on Azure Container Apps |

## ⚠️ Responsible AI note
The model predicts the **category the drawing belongs to in the dataset** (the theme the child was asked to draw). It does **not** read a child's feelings and is **not** a psychological assessment.

## Run locally
    pip install -r requirements.txt
    uvicorn app.main:app --port 7860
Then open http://localhost:7860

## Credits
- Dataset: KIDO (children's drawings). Please cite the original paper.
- Font: IBM Plex Sans Arabic (SIL Open Font License 1.1)
