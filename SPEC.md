# SPEC.md — UniendoPuntos
**Versión:** 0.1.0  
**Fecha:** 2026-03-29  

---

## 1. Visión

UniendoPuntos es una plataforma de investigación profunda asistida por agentes de IA. Su objetivo es descubrir conexiones no obvias entre hechos, personas, organizaciones y eventos a partir de fuentes públicas de internet — noticias, blogs, foros, documentos — y presentarlas en un tablero visual interactivo tipo "hilo rojo" que crece en tiempo real.

El usuario no consume conclusiones fabricadas. El sistema lo ayuda a **discernir** la realidad a partir de evidencia rastreable y verificable.

---

## 2. Problema

Los canales de información convencionales — televisión, prensa mainstream, resultados indexados en buscadores — presentan una versión curada de la realidad, determinada por los intereses de quienes controlan esos medios: políticos, económicos o de élites con acceso privilegiado a la narrativa pública. Lo que se oculta no siempre es accidental.

Las conexiones reales entre poder, dinero, personas y eventos quedan deliberadamente fuera de esa narrativa, o fragmentadas en fuentes que el ciudadano promedio nunca cruza: foros, blogs independientes, documentos filtrados, periodismo de investigación alternativo. Un investigador humano tardaría semanas en hilar esos puntos manualmente — y aun así vería solo una fracción.

UniendoPuntos no decide qué es verdad. Presenta la evidencia de todos los ángulos — medios oficiales y alternativos — y deja que el usuario razone y discirna.

---

## 3. Solución

Un equipo de agentes de IA que trabajan en paralelo de forma competitiva — cada uno tomando rutas distintas — scrapeando fuentes, extrayendo entidades nombradas (personas, organizaciones, lugares, fechas, eventos), y conectando hallazgos en un grafo compartido. El usuario observa el tablero crecer en tiempo real y puede verificar cada fuente directamente.

---

## 4. Stack Técnico

| Capa | Tecnología |
|---|---|
| Runtime | Bun |
| Frontend + API | Next.js (App Router) |
| Agentes | LangGraph JS (`@langchain/langgraph`) |
| Tiempo real | Server-Sent Events (SSE) |
| Base de datos | PostgreSQL |
| ORM | Drizzle ORM |
| Scraping | Playwright (headless) + Cheerio |
| Búsqueda web | Tavily API |
| LLM routing | OpenRouter / Groq / Gemini (fallback automático) |
| Memoria largo plazo | PostgreSQL (LangGraph checkpointer) |

---

## 5. Usuarios

**Usuario investigador:** Persona que quiere profundizar en un tema más allá de las noticias oficiales. No necesariamente técnico. Crea investigaciones, observa el tablero, verifica fuentes seleccionando cards.

---

## 6. Requerimientos Funcionales

### 6.1 Gestión de investigaciones

- **RF-01:** El usuario puede crear una nueva investigación proporcionando un tema o pregunta inicial.
- **RF-02:** El usuario puede ver una galería de investigaciones previas con su estado (activa, pausada, completada).
- **RF-03:** El usuario puede abrir una investigación existente y retomar el tablero donde quedó.
- **RF-04:** Cada investigación tiene un reporte generado al final con los hallazgos más relevantes.

### 6.2 Tablero de investigación

- **RF-05:** El tablero muestra nodos tipo "card de periódico" por cada fuente consultada, con título, resumen y URL de origen.
- **RF-06:** Las cards están conectadas por hilos rojos cuando comparten al menos una entidad nombrada (persona, organización, lugar, fecha, evento).
- **RF-07:** Las conexiones son generadas por razonamiento del agente — no por similitud semántica vectorial.
- **RF-08:** El tablero crece en tiempo real vía SSE conforme los agentes producen hallazgos.
- **RF-09:** El usuario puede seleccionar una card para abrir la fuente original y verificarla.
- **RF-10:** Al hacer scroll hacia abajo en el tablero, aparece el reporte final de la investigación.
- **RF-11:** El hilo rojo que une los puntos debe de tener fisicas reales de que cuelga

### 6.3 Agentes

- **RF-11:** La investigación es ejecutada por 3 agentes que trabajan en paralelo de forma competitiva — toman rutas distintas hacia el mismo tema.
- **RF-12:** Los agentes comparten un estado global con:
  - `visitedUrls: Set<string>` — URLs ya procesadas, ningún agente las repite.
  - `urlQueue: string[]` — URLs pendientes por visitar.
  - `nodes: Entity[]` — entidades extraídas del grafo.
  - `edges: Connection[]` — conexiones entre entidades.
  - `findings: Finding[]` — hallazgos con fuente rastreable.
- **RF-13:** Antes de visitar una URL, el agente la reserva atómicamente en `visitedUrls`. Si ya está, la salta.
- **RF-14:** Cada agente puede seguir enlaces citados dentro de una fuente (comportamiento recursivo de crawler guiado).
- **RF-15:** Los agentes extraen entidades nombradas de cada fuente: personas, organizaciones, lugares, fechas, eventos.
- **RF-16:** Si una entidad extraída ya existe en el grafo, se crea un edge (conexión) entre el nodo actual y el nodo que contiene esa entidad.
- **RF-17:** Los agentes pueden pausarse (rate limit, incertidumbre sobre qué buscar) y al reanudar revisan el estado del tablero para decidir su siguiente movimiento.
- **RF-18:** El sistema hace routing automático de modelos LLM: si un provider falla o alcanza rate limit, cambia al siguiente disponible sin interrumpir la investigación.

### 6.4 Scraping y fuentes

- **RF-19:** El sistema puede scrapear páginas web públicas extrayendo texto, imágenes referenciadas, y enlaces citados.
- **RF-20:** Los enlaces encontrados dentro de una fuente se agregan a `urlQueue` para su posterior visita.
- **RF-21:** La búsqueda inicial usa Tavily API para encontrar las primeras fuentes relevantes al tema.
- **RF-22:** Cada finding registra el tipo de fuente: `mainstream` (TV, prensa oficial, grandes medios) o `alternative` (blogs, foros, periodismo independiente, documentos filtrados).
- **RF-23:** El tablero diferencia visualmente las cards por tipo de fuente, permitiendo al usuario comparar la versión oficial vs la versión alternativa de un mismo evento o entidad.

### 6.5 Memoria a largo plazo

- **RF-22:** Las investigaciones y su estado completo persisten en PostgreSQL entre sesiones.
- **RF-23:** El sistema recuerda entidades ya investigadas en investigaciones anteriores y puede referenciarlas en nuevas investigaciones.

---

## 7. Requerimientos No Funcionales

- **RNF-01:** El tablero debe recibir actualizaciones en menos de 2 segundos desde que el agente produce un hallazgo.
- **RNF-02:** Los 3 agentes deben correr concurrentemente sin bloquearse entre sí al acceder al estado compartido.
- **RNF-03:** El sistema debe continuar operando si uno de los agentes falla — los otros dos siguen.
- **RNF-04:** El routing de modelos debe ser transparente al usuario — no debe notar el cambio de provider.
- **RNF-05:** El scraping debe respetar `robots.txt` de los sitios como buena práctica base.

---

## 8. Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────┐
│                    Next.js App                       │
│                                                     │
│  ┌──────────────┐        ┌───────────────────────┐  │
│  │   Frontend   │◄──SSE──│    API Routes         │  │
│  │  (Tablero)   │        │  /api/investigation   │  │
│  └──────────────┘        │  /api/stream          │  │
│                          └──────────┬────────────┘  │
└─────────────────────────────────────┼───────────────┘
                                      │
                          ┌───────────▼────────────┐
                          │    LangGraph Engine     │
                          │                        │
                          │  ┌─────────────────┐   │
                          │  │  Orchestrator   │   │
                          │  │     Node        │   │
                          │  └────────┬────────┘   │
                          │           │ Send() API  │
                          │    ┌──────┼──────┐      │
                          │    ▼      ▼      ▼      │
                          │  [A1]   [A2]   [A3]     │
                          │  Agent  Agent  Agent    │
                          │    └──────┼──────┘      │
                          │          │              │
                          │  ┌───────▼────────┐    │
                          │  │  Shared State  │    │
                          │  │  (LangGraph    │    │
                          │  │  checkpointer) │    │
                          │  └───────┬────────┘    │
                          └──────────┼─────────────┘
                                     │
                          ┌──────────▼─────────────┐
                          │      PostgreSQL         │
                          │  - investigations       │
                          │  - nodes (entities)     │
                          │  - edges (connections)  │
                          │  - findings             │
                          │  - checkpoints          │
                          └────────────────────────┘
```

---

## 9. Modelo de Datos

### investigations
```sql
id          UUID PRIMARY KEY
title       TEXT
query       TEXT              -- pregunta inicial del usuario
status      ENUM('active', 'paused', 'completed')
created_at  TIMESTAMP
updated_at  TIMESTAMP
```

### entities (nodos del grafo)
```sql
id              UUID PRIMARY KEY
investigation_id UUID REFERENCES investigations(id)
type            ENUM('person', 'organization', 'place', 'date', 'event')
name            TEXT
occurrences     INT           -- cuántas fuentes la mencionan
created_at      TIMESTAMP
```

### connections (edges del grafo)
```sql
id              UUID PRIMARY KEY
investigation_id UUID REFERENCES investigations(id)
entity_a_id     UUID REFERENCES entities(id)
entity_b_id     UUID REFERENCES entities(id)
finding_id      UUID REFERENCES findings(id)  -- fuente que generó la conexión
created_at      TIMESTAMP
```

### findings (hallazgos / cards del tablero)
```sql
id              UUID PRIMARY KEY
investigation_id UUID REFERENCES investigations(id)
url             TEXT
title           TEXT
summary         TEXT          -- generado por el agente
raw_content     TEXT
agent_id        INT           -- qué agente (1, 2, o 3) lo encontró
created_at      TIMESTAMP
```

---

## 10. Flujo de Agentes (LangGraph)

```
START
  │
  ▼
orchestrator_node
  │ Genera queries iniciales con Tavily
  │ Inicializa urlQueue con primeras fuentes
  │ Lanza 3 workers via Send() API en paralelo
  │
  ├──► agent_node (worker 1)
  ├──► agent_node (worker 2)
  └──► agent_node (worker 3)
         │
         │ Loop interno de cada agente:
         │  1. Toma URL de urlQueue (atómico)
         │  2. Scrape la URL
         │  3. Extrae entidades nombradas
         │  4. Compara entidades con grafo existente
         │  5. Emite findings + connections → SSE → tablero
         │  6. Agrega nuevos enlaces a urlQueue
         │  7. Decide si continuar o pausar
         │  8. Si pausa → revisa estado del tablero → decide next
         │
         ▼
      synthesizer_node
         │ Genera reporte final
         │ Persiste estado completo en PostgreSQL
         ▼
       END
```

### LLM Router
Cada agente usa un wrapper que intenta providers en orden y en loop:
1. OpenRouter
2. Groq
3. Gemini
4. vuelve a openrouter (si aun no esta disponible espera 5 min)

Si un provider responde con error de rate limit o timeout, el wrapper cambia al siguiente automáticamente sin interrumpir el grafo.

---

## 11. Flujo UI

```
/ (home)
├── Input: "¿Qué quieres investigar?"
└── Galería de investigaciones previas (cards con status)

/investigation/[id] (tablero)
├── Área superior: tablero con cards + hilos rojos (crece en tiempo real vía SSE)
│   └── Click en card → abre fuente original en nueva pestaña
└── Área inferior (scroll): reporte final de la investigación
```

---

## 12. Fuera de Alcance (MVP)

- Acceso a dark web / red Tor
- VPN integrada
- Autenticación de usuarios
- Colaboración entre usuarios
- Exportar investigaciones
- Edición manual del tablero por el usuario

---
## 13. Detalles y documentaciones

- la bd la creare en supabase
- usaremos modelos gratuitos
- la respuesta de los agntes sera por stream y no por wait

### Documentacion
- https://docs.langchain.com/oss/javascript/langgraph/workflows-agents
- https://docs.langchain.com/oss/javascript/integrations/tools/tavily_search
- https://docs.langchain.com/oss/javascript/integrations/providers/openai
- https://docs.langchain.com/oss/javascript/integrations/providers/google




## codigo de implementaciones


### openrouter

```
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: '<OPENROUTER_API_KEY>',
  defaultHeaders: {
    'HTTP-Referer': '<YOUR_SITE_URL>', // Optional. Site URL for rankings on openrouter.ai.
    'X-OpenRouter-Title': '<YOUR_SITE_NAME>', // Optional. Site title for rankings on openrouter.ai.
  },
});

async function main() {
  const completion = await openai.chat.completions.create({
    model: 'openai/gpt-5.2',
    messages: [
      {
        role: 'user',
        content: 'What is the meaning of life?',
      },
    ],
  });

  console.log(completion.choices[0].message);
}

main();

```
### groq

```

import OpenAI from "openai";
const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
});

const response = await client.responses.create({
    model: "openai/gpt-oss-20b",
    input: "Explain the importance of fast language models",
});
console.log(response.output_text);

```

