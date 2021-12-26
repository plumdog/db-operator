FROM node:16-buster as build

RUN mkdir /app
WORKDIR /app

ADD . .

RUN npm ci
RUN npm run build

FROM node:16-buster as main

RUN mkdir /app
WORKDIR /app

COPY --from=build /app/build /app
COPY --from=build /app/package-lock.json /app/package-lock.json

RUN npm ci --only=production

CMD ["node", "./src/main.js"]
