# Usar no iPhone (Freguez Vendedor pelo Expo Go)

O app do vendedor ainda não está na App Store. No iPhone ele roda dentro do **Expo Go**, um app gratuito feito para isso. As telas e as funções são as mesmas do Android.

## Antes: conta no Expo (uma vez por pessoa)

O Expo Go só abre o Freguez para quem está **entrando no Expo Go com uma conta Expo da equipe do Freguez**. Sem isso aparece o erro *"HTTP response error 403 ... this project requires authentication"*.

1. A pessoa cria uma conta gratuita em [expo.dev/signup](https://expo.dev/signup).
2. O dono do Freguez convida essa conta em **expo.dev › conta *evandofilhocostas-team* › Members › Invite**, com o papel **Viewer** (só abre o app; não mexe em nada).
3. A pessoa aceita o convite que chega no e-mail.

## Primeira vez

1. Instale o **[Expo Go](https://apps.apple.com/app/expo-go/id982107779)** pela App Store e **entre (Log in) com a conta Expo** do passo anterior.
2. Abra a **Câmera** do iPhone e aponte para o QR Code:

   <img src="../img/qrcode-iphone.png" alt="QR Code do Freguez Vendedor" width="200">

3. Toque em **Abrir no Expo Go**.
4. Aceite o uso da câmera e entre com o e-mail e a senha que a loja criou para você.

Sem câmera à mão? No iPhone, abra este link: `exp://u.expo.dev/301707a6-2941-4f1f-883c-1dfce5edfa16?channel-name=producao&runtime-version=exposdk:54.0.0`

Da próxima vez, o Freguez aparece na lista de **Recentes** do Expo Go.

## Problemas

| O que aparece | O que fazer |
|---|---|
| *HTTP response error 403 ... requires authentication* | Entre no Expo Go (aba **Settings/Account › Log in**) com a conta convidada para a equipe. Se já entrou, saia e entre de novo e leia o QR outra vez. |
| *Project is incompatible with this version of Expo Go* | Atualize o Expo Go pela App Store. |

## Atualizar

As atualizações chegam sozinhas. Se não aparecer algo novo, feche o app (deslize para cima) e abra de novo pelo Expo Go.

## Por que pelo Expo Go

Colocar na App Store exige conta de desenvolvedor da Apple e a revisão de cada versão. O Expo Go permite usar o app já, com as atualizações chegando na hora. O Expo Go da App Store roda apps feitos no **SDK 54** do Expo; por isso o Freguez para iPhone usa essa versão.

## Requisitos

iPhone com iOS 15.1 ou mais novo, com câmera.
